import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheRelay } from './cacheRelay.svelte';
import { DEFAULT_RELAYS } from './relays';

const INTERCEPT_URL = 'ws://nostr-cache.invalid';

const release = vi.fn(() => Promise.resolve());
const startCacheRelay = vi.fn((_relays: string[]) =>
  Promise.resolve<{ interceptUrl: string; release: () => Promise<void> } | null>({
    interceptUrl: INTERCEPT_URL,
    release,
  })
);

vi.mock('./nostrCache', () => ({
  startCacheRelay: (relays: string[]) => startCacheRelay(relays),
}));

// One store for the whole file: it is the app's singleton. Each test puts it
// back to `idle` so the next one starts from a relay that is not running.
beforeEach(async () => {
  await cacheRelay.stop();
  startCacheRelay.mockClear();
  release.mockClear();
});

describe('cacheRelay', () => {
  const relays = ['wss://a.example', 'wss://b.example'];

  it('starts out on the default relays', () => {
    expect(cacheRelay.upstreamRelays).toEqual(DEFAULT_RELAYS);
  });

  it('publishes the upstream relays before the relay is up', () => {
    const started = cacheRelay.start(relays);
    // Synchronously, so a view that waits for `resolved` never sees the new
    // status next to the old relays — that pairing would restart every widget.
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
    // Nothing renders while idle, and an empty list would only give a stray
    // reader a relay set that reaches nothing.
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

  it('releases a handle that arrives after a stop', async () => {
    const started = cacheRelay.start(relays);
    await cacheRelay.stop();
    await started;
    expect(release).toHaveBeenCalledTimes(1);
    expect(cacheRelay.status).toBe('idle');
  });
});
