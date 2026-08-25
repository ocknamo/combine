/**
 * OGP metadata API.
 *
 * `GET /ogp?url=<page>` fetches the page and answers with the Open Graph
 * metadata found in it, as JSON. It exists because a browser cannot do this
 * itself: an arbitrary site sends no CORS headers, so a link card has to be
 * built somewhere with no same-origin policy. A Worker is that somewhere, and
 * it is also a cache — the same link shared by fifty people is fetched once.
 *
 * The endpoint is meant to be handed to combine's embedded timeline widget,
 * which would ask it about the links it finds in a note — the app does not call
 * it itself, and does not pass it to the widget yet. That makes this public and
 * unauthenticated by nature, so the guards matter:
 * only public http(s) URLs are fetched (`target-url.ts`), only HTML is read,
 * only the first 256 KiB of it, and only for a few seconds.
 *
 * Everything below `handleRequest` is deliberately runtime-agnostic so the
 * whole flow can be exercised with a stubbed `fetch` and cache in the app's
 * test suite; only the default export touches Workers' globals.
 */
import { decodeHtml } from './decode-html';
import { type OgpMetadata, parseOgp } from './parse-ogp';
import { parseTargetUrl, type TargetUrlError } from './target-url';

export interface Env {
  /**
   * Comma-separated origins allowed to call this from a browser. Unset means
   * any origin, which is the sensible default for a service that only ever
   * reads public pages — set it when the deployment should be yours alone.
   */
  ALLOWED_ORIGINS?: string;
  /** Seconds a successful answer is cached, at the edge and in the browser. */
  CACHE_TTL?: string;
  /** Seconds a failure is cached. Short: the target may just be down. */
  ERROR_CACHE_TTL?: string;
  /** `User-Agent` sent to the target. Some sites serve no OGP without one. */
  USER_AGENT?: string;
}

/** The slice of Workers' `ExecutionContext` this uses. */
export interface WaitUntil {
  waitUntil(promise: Promise<unknown>): void;
}

/** The slice of the Cache API this uses, so a test can pass a Map. */
export interface CacheLike {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

const PATHS = new Set(['/ogp', '/']);
const DEFAULT_CACHE_TTL = 3600;
const DEFAULT_ERROR_CACHE_TTL = 300;
const DEFAULT_USER_AGENT =
  'combine-ogp/1.0 (+https://github.com/ocknamo/combine; link preview fetcher)';
/** A page's metadata lives in its head; the rest is not worth the bandwidth. */
const MAX_BYTES = 256 * 1024;
const TIMEOUT_MS = 6000;

type ErrorCode =
  | TargetUrlError
  | 'method_not_allowed'
  | 'not_found'
  | 'upstream_error'
  | 'unsupported_content_type'
  | 'timeout'
  | 'fetch_failed';

const ERROR_STATUS: Record<ErrorCode, number> = {
  missing_url: 400,
  invalid_url: 400,
  unsupported_scheme: 400,
  blocked_host: 403,
  blocked_port: 403,
  method_not_allowed: 405,
  not_found: 404,
  upstream_error: 502,
  unsupported_content_type: 415,
  timeout: 504,
  fetch_failed: 502,
};

export interface OgpResponse extends OgpMetadata {
  /** The URL as asked for, before redirects and before `og:url` replaced it. */
  requestedUrl: string;
  /** Unix seconds, so a caller can tell a fresh answer from a cached one. */
  fetchedAt: number;
}

function number(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * CORS headers for one request.
 *
 * With no allowlist configured the answer is `*`; with one, the caller's origin
 * is echoed only if it is listed — and `Vary: Origin` goes with it, or the edge
 * cache would serve one origin's answer (and its header) to another.
 */
function corsHeaders(request: Request, env: Env): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
  if (allowed.length === 0) return { 'access-control-allow-origin': '*' };

  const origin = request.headers.get('origin');
  if (origin && allowed.includes(origin)) {
    return { 'access-control-allow-origin': origin, vary: 'Origin' };
  }
  return { vary: 'Origin' };
}

function json(body: unknown, status: number, ttl: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${ttl}`,
      ...cors,
    },
  });
}

function failure(
  code: ErrorCode,
  env: Env,
  cors: Record<string, string>,
  detail?: Record<string, unknown>
): Response {
  return json(
    { error: code, ...detail },
    ERROR_STATUS[code],
    number(env.ERROR_CACHE_TTL, DEFAULT_ERROR_CACHE_TTL),
    cors
  );
}

/**
 * Read at most `max` bytes of a body.
 *
 * Cancelling the stream is what actually stops a multi-megabyte page from being
 * paid for: without it the rest keeps arriving while nothing reads it.
 */
async function readLimited(body: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < max) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  const bytes = new Uint8Array(Math.min(size, max));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= bytes.length) break;
    bytes.set(chunk.subarray(0, bytes.length - offset), offset);
    offset += chunk.length;
  }
  return bytes;
}

/**
 * The whole request, minus the runtime.
 *
 * @param cache Edge cache to read and write, when the runtime has one. Absent
 *   (a test, or a runtime without the Cache API) the request is simply served
 *   uncached — the browser-facing `Cache-Control` still does its half.
 */
export async function handleRequest(
  request: Request,
  env: Env,
  ctx: WaitUntil,
  cache?: CacheLike
): Promise<Response> {
  const cors = corsHeaders(request, env);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-max-age': '86400',
      },
    });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return failure('method_not_allowed', env, cors);
  }

  const requestUrl = new URL(request.url);
  if (!PATHS.has(requestUrl.pathname)) return failure('not_found', env, cors);

  const target = parseTargetUrl(requestUrl.searchParams.get('url'));
  if (!target.ok) return failure(target.error, env, cors);

  // One cache entry per target, whatever else the caller put in the query
  // string and whichever of the two paths it used.
  const cacheKey = new Request(
    `${requestUrl.origin}/ogp?url=${encodeURIComponent(target.url.href)}`,
    { method: 'GET' }
  );
  const cached = await cache?.match(cacheKey);
  if (cached) {
    // The cached body is shared between origins; its CORS header is not.
    const headers = new Headers(cached.headers);
    for (const [name, value] of Object.entries(cors)) headers.set(name, value);
    headers.set('x-ogp-cache', 'hit');
    return new Response(cached.body, { status: cached.status, headers });
  }

  const result = await fetchMetadata(target.url, env);
  if (!result.ok) {
    return failure(result.error, env, cors, {
      requestedUrl: target.url.href,
      ...(result.status === undefined ? {} : { status: result.status }),
    });
  }

  const ttl = number(env.CACHE_TTL, DEFAULT_CACHE_TTL);
  const response = json(result.metadata, 200, ttl, cors);
  if (cache) {
    // Store without the request's CORS header; the hit path puts the right one
    // back. `clone` because the response body is about to be streamed out.
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  }
  return response;
}

type FetchResult =
  | { ok: true; metadata: OgpResponse }
  | { ok: false; error: ErrorCode; status?: number };

async function fetchMetadata(url: URL, env: Env): Promise<FetchResult> {
  let response: Response;
  try {
    response = await fetch(url.href, {
      method: 'GET',
      headers: {
        'user-agent': env.USER_AGENT ?? DEFAULT_USER_AGENT,
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
        'accept-language': 'ja,en;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && /timeout|abort/i.test(error.name + error.message);
    return { ok: false, error: timedOut ? 'timeout' : 'fetch_failed' };
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    return { ok: false, error: 'upstream_error', status: response.status };
  }

  const contentType = response.headers.get('content-type');
  if (contentType !== null && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    await response.body?.cancel().catch(() => {});
    return { ok: false, error: 'unsupported_content_type' };
  }

  const body = response.body;
  if (!body) return { ok: false, error: 'fetch_failed' };

  let bytes: Uint8Array;
  try {
    bytes = await readLimited(body, MAX_BYTES);
  } catch {
    return { ok: false, error: 'fetch_failed' };
  }

  // `response.url` is the URL after redirects, which is what relative image
  // paths and a relative canonical link resolve against.
  const fetchedUrl = response.url || url.href;
  const metadata = parseOgp(decodeHtml(bytes, contentType), fetchedUrl);
  return {
    ok: true,
    metadata: { ...metadata, requestedUrl: url.href, fetchedAt: Math.floor(Date.now() / 1000) },
  };
}

export default {
  fetch(request: Request, env: Env, ctx: WaitUntil): Promise<Response> {
    // `caches` is a Workers global; the handler stays testable by taking it as
    // an argument rather than reaching for it itself.
    const cache = (globalThis as { caches?: { default?: CacheLike } }).caches?.default;
    return handleRequest(request, env, ctx, cache);
  },
};
