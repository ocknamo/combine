import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = {
  pubkey: null as string | null,
  getWriteRelays: vi.fn(async () => ['wss://write.example']),
  signEvent: vi.fn(async (event: Record<string, unknown>) => ({ ...event, id: 'e'.repeat(64) })),
};
const cacheRelay = { interceptUrl: null as string | null };
const publishEvent = vi.fn(async () => ({ accepted: ['ws://cache.invalid'], rejected: [] }));
const show = vi.fn();

vi.mock('./auth.svelte', () => ({ auth }));
vi.mock('./cacheRelay.svelte', () => ({ cacheRelay }));
vi.mock('./publish', () => ({ publishEvent }));
vi.mock('./toast.svelte', () => ({ toast: { show } }));

const { buildReaction, react } = await import('./reaction');

const ID = 'a'.repeat(64);
const AUTHOR = 'b'.repeat(64);
const ME = 'c'.repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
  auth.pubkey = ME;
  cacheRelay.interceptUrl = 'ws://cache.invalid';
});

describe('buildReaction', () => {
  it('likes a note with a `+`', () => {
    expect(buildReaction({ id: ID, pubkey: AUTHOR, kind: 1 }, ME, 1700000000)).toEqual({
      kind: 7,
      content: '+',
      tags: [
        ['e', ID],
        ['p', AUTHOR],
        ['k', '1'],
      ],
      created_at: 1700000000,
      pubkey: ME,
    });
  });

  it('names the kind it reacted to whatever that kind was', () => {
    expect(buildReaction({ id: ID, pubkey: AUTHOR, kind: 30023 }, ME, 1700000000).tags).toEqual([
      ['e', ID],
      ['p', AUTHOR],
      ['k', '30023'],
    ]);
  });

  it('leaves out the author when the card did not say who it was', () => {
    expect(buildReaction({ id: ID, pubkey: null, kind: 1 }, ME, 1700000000).tags).toEqual([
      ['e', ID],
      ['k', '1'],
    ]);
  });
});

describe('react', () => {
  it('signs and publishes through the cache relay, which writes through', async () => {
    await react({ id: ID, pubkey: AUTHOR, kind: 1 });

    expect(auth.signEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: 7, content: '+' }));
    expect(publishEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'e'.repeat(64) }), [
      'ws://cache.invalid',
    ]);
    // It forwards upstream itself; sending there too would send twice.
    expect(auth.getWriteRelays).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith('リアクションしました');
  });

  it('falls back to the write relays when no cache relay is running', async () => {
    cacheRelay.interceptUrl = null;
    await react({ id: ID, pubkey: AUTHOR, kind: 1 });

    expect(publishEvent).toHaveBeenCalledWith(expect.anything(), ['wss://write.example']);
  });

  it('asks for a login instead of signing when there is none', async () => {
    auth.pubkey = null;
    await react({ id: ID, pubkey: AUTHOR, kind: 1 });

    expect(auth.signEvent).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith('リアクションするにはログインが必要です。', 'error');
  });

  it('reports a reaction no relay took', async () => {
    publishEvent.mockResolvedValueOnce({
      accepted: [],
      rejected: [{ relay: 'ws://cache.invalid', reason: 'blocked' }],
    } as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await react({ id: ID, pubkey: AUTHOR, kind: 1 });

    expect(show).toHaveBeenCalledWith('リアクションに失敗しました', 'error');
  });

  it('reports a refused signature the same way', async () => {
    auth.signEvent.mockRejectedValueOnce(new Error('USER_REJECTED') as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await react({ id: ID, pubkey: AUTHOR, kind: 1 });

    expect(publishEvent).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith('リアクションに失敗しました', 'error');
  });
});
