import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  NOSTR_CACHE_DB_NAME,
  NOSTR_CACHE_ORIGIN,
  NOSTR_CACHE_PROFILE_FRESHNESS,
  NOSTR_CACHE_SCRIPT_URL,
  relaysAttr,
  startCacheRelay,
} from './nostrCache';

describe('NOSTR_CACHE_SCRIPT_URL', () => {
  it('points at the hosted widget bundle', () => {
    const url = new URL(NOSTR_CACHE_SCRIPT_URL);
    expect(url.origin).toBe(NOSTR_CACHE_ORIGIN);
    expect(url.pathname).toBe('/nostr-cache/nostr-timeline.js');
  });
});

describe('NOSTR_CACHE_DB_NAME', () => {
  // combine and the nostr-cache demo share an origin in production, so the
  // widget's default would put both in the same database.
  it('is not the widget default', () => {
    expect(NOSTR_CACHE_DB_NAME).not.toBe('nostr-cache-embed');
  });
});

describe('NOSTR_CACHE_PROFILE_FRESHNESS', () => {
  // Reaches the relay as a `profileFreshness` window and the widgets as a
  // `profile-freshness` attribute; a non-positive one switches the window off
  // and a fractional one is rejected as a typo.
  it('is a positive whole number of seconds', () => {
    expect(Number.isInteger(NOSTR_CACHE_PROFILE_FRESHNESS)).toBe(true);
    expect(NOSTR_CACHE_PROFILE_FRESHNESS).toBeGreaterThan(0);
  });
});

describe('startCacheRelay', () => {
  // `loadNostrTimeline` returns early when the elements are already defined,
  // which keeps these tests off the DOM (there is none in this environment) and
  // off the network.
  beforeAll(() => {
    vi.stubGlobal('customElements', { get: () => class {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('customElements', { get: () => class {} });
  });

  it('acquires the relay with combine settings', async () => {
    const handle = { interceptUrl: 'ws://nostr-cache.invalid', release: vi.fn() };
    const acquireRelayHost = vi.fn().mockResolvedValue(handle);
    vi.stubGlobal('NostrTimelineEmbed', { acquireRelayHost });

    await expect(startCacheRelay(['wss://a.example'])).resolves.toBe(handle);
    expect(acquireRelayHost).toHaveBeenCalledWith({
      upstreamRelays: ['wss://a.example'],
      dbName: NOSTR_CACHE_DB_NAME,
      profileFreshness: NOSTR_CACHE_PROFILE_FRESHNESS,
    });
  });

  // The deployed bundle may predate the relay API (ocknamo/nostr-cache#67).
  it('returns null when the bundle does not expose the relay API', async () => {
    vi.stubGlobal('NostrTimelineEmbed', {});
    await expect(startCacheRelay(['wss://a.example'])).resolves.toBeNull();
  });

  it('returns null when the relay fails to start', async () => {
    vi.stubGlobal('NostrTimelineEmbed', {
      acquireRelayHost: vi.fn().mockRejectedValue(new Error('no IndexedDB')),
    });
    await expect(startCacheRelay(['wss://a.example'])).resolves.toBeNull();
  });
});

describe('relaysAttr', () => {
  it('joins relays with commas', () => {
    expect(relaysAttr(['wss://nos.lol', 'wss://relay.damus.io'])).toBe(
      'wss://nos.lol,wss://relay.damus.io'
    );
  });

  it('returns an empty string for no relays', () => {
    expect(relaysAttr([])).toBe('');
  });
});
