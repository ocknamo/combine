/**
 * HTML fetching proxy for link cards.
 *
 * A browser cannot read another site's HTML — no CORS headers — so the fetching
 * happens here, where there is no same-origin policy, and once for everyone who
 * shares the link. The tags are read out of the answer by the caller: the
 * widget takes this URL as `ogp-proxy` and parses it itself (nostr-cache#89
 * replaced the JSON API this used to be). Public and unauthenticated by nature,
 * which is what the guards below are for.
 *
 * Everything below `handleRequest` is deliberately runtime-agnostic so the
 * whole flow can be exercised with a stubbed `fetch` and cache in the app's
 * test suite; only the default export touches Workers' globals.
 */
import { decodeHtml } from './decode-html';
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
/**
 * How long the target gets to answer.
 *
 * Under the caller's own patience on purpose: nostr-cache's widget abandons the
 * request at 5s, so a longer budget here would spend the time and then have
 * nowhere to deliver the answer. Giving up first means the caller gets a real
 * `timeout` — and the edge keeps serving what did succeed.
 */
const TIMEOUT_MS = 4000;
/** Redirect statuses worth following; anything else 3xx has no `Location`. */
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
/** Hops allowed before a redirect chain is called a loop. */
const MAX_REDIRECTS = 5;

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

/**
 * Someone else's page, served from this Worker's own origin — harmless to
 * `fetch`, but opened directly it would run the target's scripts here. The
 * `sandbox` policy and `nosniff` stop that without a `fetch` caller noticing.
 */
function html(body: string, ttl: number, cors: Record<string, string>): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': `public, max-age=${ttl}`,
      'content-security-policy': 'sandbox',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      ...cors,
    },
  });
}

/**
 * Why nothing came back. The widget reads any non-HTML answer as "no card", so
 * this body is for whoever curls the endpoint to find out which guard fired.
 */
function failure(
  code: ErrorCode,
  env: Env,
  cors: Record<string, string>,
  detail?: Record<string, unknown>
): Response {
  return new Response(JSON.stringify({ error: code, ...detail }), {
    status: ERROR_STATUS[code],
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${number(env.ERROR_CACHE_TTL, DEFAULT_ERROR_CACHE_TTL)}`,
      ...cors,
    },
  });
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

  const result = await fetchHtml(target.url, env);
  if (!result.ok) {
    return failure(result.error, env, cors, {
      requestedUrl: target.url.href,
      ...(result.status === undefined ? {} : { status: result.status }),
    });
  }

  const ttl = number(env.CACHE_TTL, DEFAULT_CACHE_TTL);
  const response = html(result.html, ttl, cors);
  if (cache) {
    // Store without the request's CORS header; the hit path puts the right one
    // back. `clone` because the response body is about to be streamed out.
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  }
  return response;
}

type FetchResult = { ok: true; html: string } | { ok: false; error: ErrorCode; status?: number };

async function fetchHtml(url: URL, env: Env): Promise<FetchResult> {
  let current = url;
  let response: Response;
  for (let hop = 0; ; hop += 1) {
    try {
      response = await fetch(current.href, {
        method: 'GET',
        headers: {
          'user-agent': env.USER_AGENT ?? DEFAULT_USER_AGENT,
          accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
          'accept-language': 'ja,en;q=0.8',
        },
        // Followed by hand so every hop goes through `parseTargetUrl` too:
        // `follow` would let a public page redirect the fetch to a host the
        // guard exists to refuse, which is the open-proxy this must not be.
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut = error instanceof Error && /timeout|abort/i.test(error.name + error.message);
      return { ok: false, error: timedOut ? 'timeout' : 'fetch_failed' };
    }

    const location = REDIRECT_STATUS.has(response.status) ? response.headers.get('location') : null;
    if (location === null) break;
    // Nothing below reads a redirect's body.
    await response.body?.cancel().catch(() => {});
    if (hop >= MAX_REDIRECTS) return { ok: false, error: 'fetch_failed' };

    let next: URL;
    try {
      next = new URL(location, current.href);
    } catch {
      return { ok: false, error: 'invalid_url' };
    }
    const target = parseTargetUrl(next.href);
    if (!target.ok) return { ok: false, error: target.error };
    current = target.url;
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

  // Always UTF-8 out: the caller trusts the charset in `content-type`, so
  // passing a Shift_JIS page through under this header would be mojibake.
  return { ok: true, html: decodeHtml(bytes, contentType) };
}

export default {
  fetch(request: Request, env: Env, ctx: WaitUntil): Promise<Response> {
    // `caches` is a Workers global; the handler stays testable by taking it as
    // an argument rather than reaching for it itself.
    const cache = (globalThis as { caches?: { default?: CacheLike } }).caches?.default;
    return handleRequest(request, env, ctx, cache);
  },
};
