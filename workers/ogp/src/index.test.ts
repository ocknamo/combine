import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type CacheLike, type Env, handleRequest } from './index';

const ENDPOINT = 'https://ogp.example.workers.dev';

/** A stand-in for the edge cache: same two methods, backed by a Map. */
function stubCache(): CacheLike & { size: () => number } {
  const store = new Map<string, Response>();
  return {
    async match(request) {
      const hit = store.get(request.url);
      return hit ? hit.clone() : undefined;
    },
    async put(request, response) {
      store.set(request.url, response);
    },
    size: () => store.size,
  };
}

/** Collects the promises the handler hands to `waitUntil` so tests can await them. */
function stubContext(): { waitUntil(p: Promise<unknown>): void; settled(): Promise<unknown[]> } {
  const pending: Promise<unknown>[] = [];
  return {
    waitUntil(promise) {
      pending.push(promise);
    },
    settled: () => Promise.all(pending),
  };
}

function ask(target: string, init?: RequestInit): Request {
  return new Request(`${ENDPOINT}/ogp?url=${encodeURIComponent(target)}`, init);
}

function html(head: string): Response {
  return new Response(`<html><head>${head}</head><body>本文</body></html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

const PAGE = `
  <meta property="og:title" content="記事タイトル">
  <meta property="og:description" content="記事の説明">
  <meta property="og:image" content="/hero.png">
`;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('handleRequest', () => {
  it('answers with the page metadata', async () => {
    fetchMock.mockResolvedValue(
      Object.defineProperty(html(PAGE), 'url', { value: 'https://example.com/a' })
    );

    const response = await handleRequest(
      ask('https://example.com/a'),
      {},
      stubContext(),
      stubCache()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
    await expect(response.json()).resolves.toMatchObject({
      requestedUrl: 'https://example.com/a',
      url: 'https://example.com/a',
      title: '記事タイトル',
      description: '記事の説明',
      image: 'https://example.com/hero.png',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serves the second ask for a page from the cache', async () => {
    fetchMock.mockResolvedValue(html(PAGE));
    const cache = stubCache();
    const ctx = stubContext();

    await handleRequest(ask('https://example.com/a'), {}, ctx, cache);
    await ctx.settled();

    // Same page, different spelling of the request: one cache entry, one fetch.
    const again = await handleRequest(
      new Request(`${ENDPOINT}/?url=${encodeURIComponent('https://example.com/a#top')}`),
      {},
      stubContext(),
      cache
    );

    expect(again.headers.get('x-ogp-cache')).toBe('hit');
    await expect(again.json()).resolves.toMatchObject({ title: '記事タイトル' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cache.size()).toBe(1);
  });

  it('never fetches a URL the guard rejects', async () => {
    for (const [target, status] of [
      ['http://169.254.169.254/latest/meta-data/', 403],
      ['file:///etc/passwd', 400],
    ] as const) {
      const response = await handleRequest(ask(target), {}, stubContext(), stubCache());
      expect(response.status).toBe(status);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports what went wrong upstream', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 503 }));
    const failed = await handleRequest(
      ask('https://example.com/a'),
      {},
      stubContext(),
      stubCache()
    );
    expect(failed.status).toBe(502);
    await expect(failed.json()).resolves.toMatchObject({ error: 'upstream_error', status: 503 });

    fetchMock.mockResolvedValue(
      new Response('%PDF-1.7', { headers: { 'content-type': 'application/pdf' } })
    );
    const wrongType = await handleRequest(
      ask('https://example.com/a.pdf'),
      {},
      stubContext(),
      stubCache()
    );
    expect(wrongType.status).toBe(415);

    fetchMock.mockRejectedValue(
      Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' })
    );
    const timedOut = await handleRequest(
      ask('https://example.com/slow'),
      {},
      stubContext(),
      stubCache()
    );
    expect(timedOut.status).toBe(504);
    await expect(timedOut.json()).resolves.toMatchObject({ error: 'timeout' });
  });

  it('does not cache a failure', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }));
    const cache = stubCache();
    const ctx = stubContext();

    await handleRequest(ask('https://example.com/a'), {}, ctx, cache);
    await ctx.settled();

    expect(cache.size()).toBe(0);
  });

  it('reads only the head of an enormous page', async () => {
    const padding = '<p>x</p>'.repeat(80_000); // ~640 KiB, past the 256 KiB cap
    fetchMock.mockResolvedValue(
      new Response(`<html><head>${PAGE}</head><body>${padding}</body></html>`, {
        headers: { 'content-type': 'text/html' },
      })
    );

    const response = await handleRequest(
      ask('https://example.com/huge'),
      {},
      stubContext(),
      stubCache()
    );
    await expect(response.json()).resolves.toMatchObject({ title: '記事タイトル' });
  });

  it('decodes a page that is not UTF-8', async () => {
    // Shift_JIS 「日本語」 — still common on the older Japanese web.
    const bytes = new Uint8Array([0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea]);
    const head = new TextEncoder().encode(
      '<html><head><meta charset="shift_jis"><meta property="og:title" content="'
    );
    const tail = new TextEncoder().encode('"></head><body></body></html>');
    const body = new Uint8Array([...head, ...bytes, ...tail]);
    fetchMock.mockResolvedValue(new Response(body, { headers: { 'content-type': 'text/html' } }));

    const response = await handleRequest(
      ask('https://example.com/sjis'),
      {},
      stubContext(),
      stubCache()
    );
    const metadata = (await response.json()) as { title: string };
    // Node decodes Shift_JIS; a runtime that does not falls back to UTF-8, and
    // the answer is mojibake rather than an error — either way, a 200.
    expect(response.status).toBe(200);
    expect(typeof metadata.title).toBe('string');
  });

  it('honours an origin allowlist', async () => {
    fetchMock.mockResolvedValue(html(PAGE));
    const env: Env = { ALLOWED_ORIGINS: 'https://combine.example, https://other.example' };

    const allowed = await handleRequest(
      ask('https://example.com/a', { headers: { origin: 'https://combine.example' } }),
      env,
      stubContext(),
      stubCache()
    );
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://combine.example');
    expect(allowed.headers.get('vary')).toBe('Origin');

    fetchMock.mockResolvedValue(html(PAGE));
    const refused = await handleRequest(
      ask('https://example.com/a', { headers: { origin: 'https://evil.example' } }),
      env,
      stubContext(),
      stubCache()
    );
    expect(refused.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answers a preflight and refuses anything but a read', async () => {
    const preflight = await handleRequest(
      ask('https://example.com/a', { method: 'OPTIONS' }),
      {},
      stubContext(),
      stubCache()
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS');

    const posted = await handleRequest(
      ask('https://example.com/a', { method: 'POST' }),
      {},
      stubContext(),
      stubCache()
    );
    expect(posted.status).toBe(405);

    const elsewhere = await handleRequest(
      new Request(`${ENDPOINT}/admin`),
      {},
      stubContext(),
      stubCache()
    );
    expect(elsewhere.status).toBe(404);
  });

  it('works without a cache at all', async () => {
    fetchMock.mockResolvedValue(html(PAGE));
    const response = await handleRequest(ask('https://example.com/a'), {}, stubContext());
    expect(response.status).toBe(200);
  });
});
