import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = {
  pubkey: null as string | null,
  getWriteRelays: vi.fn(async () => ['wss://write.example']),
  signEvent: vi.fn(async (event: Record<string, unknown>) => ({ ...event, id: 'e'.repeat(64) })),
};
const publishEvent = vi.fn(async () => ({ accepted: ['wss://write.example'], rejected: [] }));
const show = vi.fn();

vi.mock('./auth.svelte', () => ({ auth }));
vi.mock('./publish', () => ({ publishEvent }));
vi.mock('./toast.svelte', () => ({ toast: { show } }));

const { buildRepost, repost } = await import('./repost');

const ID = 'a'.repeat(64);
const AUTHOR = 'b'.repeat(64);
const ME = 'c'.repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
  auth.pubkey = ME;
});

describe('buildRepost', () => {
  it('reposts a note as kind 6', () => {
    expect(buildRepost({ id: ID, pubkey: AUTHOR, kind: 1 }, ME, 1700000000)).toEqual({
      kind: 6,
      content: '',
      tags: [
        ['e', ID],
        ['p', AUTHOR],
      ],
      created_at: 1700000000,
      pubkey: ME,
    });
  });

  it('reposts anything else as a generic repost naming the kind', () => {
    const event = buildRepost({ id: ID, pubkey: AUTHOR, kind: 30023 }, ME, 1700000000);
    expect(event.kind).toBe(16);
    expect(event.tags).toEqual([
      ['e', ID],
      ['p', AUTHOR],
      ['k', '30023'],
    ]);
  });

  it('leaves out the author when the card did not say who it was', () => {
    expect(buildRepost({ id: ID, pubkey: null, kind: 1 }, ME, 1700000000).tags).toEqual([
      ['e', ID],
    ]);
  });
});

describe('repost', () => {
  it('signs and publishes to the write relays', async () => {
    await repost({ id: ID, pubkey: AUTHOR, kind: 1 });

    expect(auth.signEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: 6 }));
    expect(publishEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'e'.repeat(64) }), [
      'wss://write.example',
    ]);
    expect(show).toHaveBeenCalledWith('リポストしました');
  });

  it('asks for a login instead of signing when there is none', async () => {
    auth.pubkey = null;
    await repost({ id: ID, pubkey: AUTHOR, kind: 1 });

    expect(auth.signEvent).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith('リポストするにはログインが必要です。', 'error');
  });

  it('reports a repost no relay took', async () => {
    publishEvent.mockResolvedValueOnce({
      accepted: [],
      rejected: [{ relay: 'wss://write.example', reason: 'blocked' }],
    } as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await repost({ id: ID, pubkey: AUTHOR, kind: 1 });

    expect(show).toHaveBeenCalledWith('リポストに失敗しました', 'error');
  });

  it('reports a refused signature the same way', async () => {
    auth.signEvent.mockRejectedValueOnce(new Error('USER_REJECTED') as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await repost({ id: ID, pubkey: AUTHOR, kind: 1 });

    expect(publishEvent).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith('リポストに失敗しました', 'error');
  });
});
