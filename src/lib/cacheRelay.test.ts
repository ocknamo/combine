import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheRelay } from './cacheRelay.svelte';
import { DEFAULT_RELAYS } from './relays';

const INTERCEPT_URL = 'ws://nostr-cache.invalid';

type Handle = {
  interceptUrl: string;
  release: () => Promise<void>;
  clearCache?: () => Promise<void>;
};

const release = vi.fn(() => Promise.resolve());
const clearCache = vi.fn(() => Promise.resolve());
const startCacheRelay = vi.fn((_relays: string[]) =>
  Promise.resolve<Handle | null>({
    interceptUrl: INTERCEPT_URL,
    release,
    clearCache,
  })
);

vi.mock('./nostrCache', () => ({
  startCacheRelay: (relays: string[]) => startCacheRelay(relays),
}));

// The store is the app's singleton, so each test puts it back to `idle` first.
beforeEach(async () => {
  await cacheRelay.stop();
  startCacheRelay.mockClear();
  release.mockClear();
  clearCache.mockClear();
});

describe('cacheRelay', () => {
  const relays = ['wss://a.example', 'wss://b.example'];

  it('starts out on the default relays', () => {
    expect(cacheRelay.upstreamRelays).toEqual(DEFAULT_RELAYS);
  });

  it('publishes the upstream relays before the relay is up', () => {
    const started = cacheRelay.start(relays);
    // Synchronously: a view that waits for `resolved` must never see the new
    // status next to the old relays, which would restart every widget.
    expect(cacheRelay.upstreamRelays).toEqual(relays);
    expect(cacheRelay.resolved).toBe(false);
    return started;
  });

  it('reads through the relay once it is up', async () => {
    await cacheRelay.start(relays);
    expect(cacheRelay.status).toBe('ready');
    expect(cacheRelay.interceptUrl).toBe(INTERCEPT_URL);
    expect(cacheRelay.viewRelays).toEqual([INTERCEPT_URL]);
  });

  it('falls back to the upstream relays when there is no cache', async () => {
    startCacheRelay.mockResolvedValueOnce(null);
    await cacheRelay.start(relays);
    expect(cacheRelay.status).toBe('unavailable');
    expect(cacheRelay.resolved).toBe(true);
    expect(cacheRelay.viewRelays).toEqual(relays);
  });

  it('keeps the upstream relays over a stop, and replaces them on the next start', async () => {
    await cacheRelay.start(relays);
    await cacheRelay.stop();
    expect(release).toHaveBeenCalledTimes(1);
    expect(cacheRelay.resolved).toBe(false);
    expect(cacheRelay.upstreamRelays).toEqual(relays);

    const next = ['wss://c.example'];
    await cacheRelay.start(next);
    expect(cacheRelay.upstreamRelays).toEqual(next);
    expect(startCacheRelay).toHaveBeenLastCalledWith(next);
  });

  it('shares one attempt between concurrent callers', async () => {
    const first = cacheRelay.start(relays);
    const second = cacheRelay.start(['wss://ignored.example']);
    await Promise.all([first, second]);
    expect(startCacheRelay).toHaveBeenCalledTimes(1);
    expect(cacheRelay.upstreamRelays).toEqual(relays);
  });

  it('clears the cache through the running relay', async () => {
    await cacheRelay.start(relays);
    expect(cacheRelay.canClearCache).toBe(true);

    await cacheRelay.clearCache();
    expect(clearCache).toHaveBeenCalledTimes(1);
  });

  it('refuses to clear a cache the deployed bundle cannot clear', async () => {
    startCacheRelay.mockResolvedValueOnce({ interceptUrl: INTERCEPT_URL, release });
    await cacheRelay.start(relays);

    expect(cacheRelay.canClearCache).toBe(false);
    await expect(cacheRelay.clearCache()).rejects.toThrow();
  });

  it('refuses to clear once the relay has been stopped', async () => {
    await cacheRelay.start(relays);
    await cacheRelay.stop();

    expect(cacheRelay.canClearCache).toBe(false);
    await expect(cacheRelay.clearCache()).rejects.toThrow();
    expect(clearCache).not.toHaveBeenCalled();
  });

  it('releases a handle that arrives after a stop', async () => {
    const started = cacheRelay.start(relays);
    await cacheRelay.stop();
    await started;
    expect(release).toHaveBeenCalledTimes(1);
    expect(cacheRelay.status).toBe('idle');
  });
});
