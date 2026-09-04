import type { NostrEvent } from 'nosskey-iframe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ME = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);
const CACHE = 'ws://cache.invalid';

const auth = {
  pubkey: ME as string | null,
  getWriteRelays: vi.fn(async () => ['wss://write.example', CACHE]),
  signEvent: vi.fn(
    async (event: NostrEvent): Promise<NostrEvent> => ({
      ...event,
      id: 'e'.repeat(64),
    })
  ),
};
const cacheRelay = { interceptUrl: null as string | null };
const publishEvent = vi.fn(async () => ({ accepted: [CACHE], rejected: [] }));

vi.mock('./auth.svelte', () => ({ auth }));
vi.mock('./cacheRelay.svelte', () => ({ cacheRelay }));
vi.mock('./publish', () => ({ publishEvent }));

const { publishTargets, signAndPublish } = await import('./publishOwn');

const EVENT = { kind: 3, content: '', tags: [], created_at: 1800000000, pubkey: ME };

beforeEach(() => {
  vi.clearAllMocks();
  auth.pubkey = ME;
  auth.signEvent.mockImplementation(async (event) => ({ ...event, id: 'e'.repeat(64) }));
  cacheRelay.interceptUrl = CACHE;
});

describe('publishTargets', () => {
  it('is the cache relay alone by default', async () => {
    expect(await publishTargets()).toEqual([CACHE]);
    expect(auth.getWriteRelays).not.toHaveBeenCalled();
  });

  it('adds the write relays when asked, without repeating the cache', async () => {
    // The cache forwards to the *read* relays it was started with, so an event
    // that must not be lost needs the write relays named too.
    expect(await publishTargets({ writeRelays: true })).toEqual([CACHE, 'wss://write.example']);
  });

  it('falls back to the write relays when there is no cache relay', async () => {
    cacheRelay.interceptUrl = null;
    expect(await publishTargets()).toEqual(['wss://write.example', CACHE]);
  });
});

describe('signAndPublish', () => {
  it('publishes what the signer handed back', async () => {
    expect(await signAndPublish(EVENT)).toBe(true);
    expect(publishEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: 3 }), [CACHE]);
  });

  it('reports failure when no relay took the event', async () => {
    publishEvent.mockResolvedValue({ accepted: [], rejected: [] });
    expect(await signAndPublish(EVENT)).toBe(false);
  });

  it('refuses to publish an event signed by another account', async () => {
    // The account can be switched at nosskey.app mid-press; a contact list
    // signed by the new one would replace follows nobody asked to change.
    auth.signEvent.mockResolvedValue({ ...EVENT, pubkey: OTHER, id: 'e'.repeat(64) });
    await expect(signAndPublish(EVENT)).rejects.toThrow(/different account/);
    expect(publishEvent).not.toHaveBeenCalled();
  });
});
