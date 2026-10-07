import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileEvent } from './profileMeta';
import type { FetchReplaceableResult } from './replaceableFetch';

const ME = 'a'.repeat(64);

const auth = {
  relays: ['wss://read.example', 'wss://both.example'],
  getWriteRelays: vi.fn(async () => ['wss://write.example', 'wss://both.example']),
};
const fetchReplaceable = vi.fn(
  async (
    _spec: unknown,
    _pubkey: string,
    _relays: string[]
  ): Promise<FetchReplaceableResult<ProfileEvent>> => ({ event: null, answered: [], failed: [] })
);

vi.mock('./auth.svelte', () => ({ auth }));
vi.mock('./replaceableFetch', () => ({
  fetchReplaceable: (spec: unknown, pubkey: string, relays: string[]) =>
    fetchReplaceable(spec, pubkey, relays),
}));

const { fetchProfileBase, judgeBase, rememberPublished } = await import('./profileEdit');

function profile(content: string, created_at = 1000): ProfileEvent {
  return { kind: 0, pubkey: ME, created_at, content, tags: [] };
}

describe('judgeBase', () => {
  it('refuses when nobody answered, even with a base in hand', () => {
    expect(judgeBase({ base: profile('{}'), answered: 0, asked: 3 })).toBe('unavailable');
  });

  it('edits a readable profile', () => {
    expect(judgeBase({ base: profile('{"name":"a"}'), answered: 1, asked: 3 })).toBe('ready');
  });

  it('will not write over content that is not an object', () => {
    expect(judgeBase({ base: profile('oops'), answered: 1, asked: 3 })).toBe('unreadable');
  });

  it('starts a new profile only when enough relays say there is none', () => {
    expect(judgeBase({ base: null, answered: 1, asked: 3 })).toBe('unavailable');
    expect(judgeBase({ base: null, answered: 2, asked: 3 })).toBe('new');
    // Someone on one relay is not locked out forever.
    expect(judgeBase({ base: null, answered: 1, asked: 1 })).toBe('new');
  });
});

describe('fetchProfileBase', () => {
  beforeEach(() => {
    fetchReplaceable.mockClear();
  });

  it('asks the read and write relays once each', async () => {
    await fetchProfileBase(ME);
    expect(fetchReplaceable.mock.calls[0]?.[2]).toEqual([
      'wss://read.example',
      'wss://both.example',
      'wss://write.example',
    ]);
  });

  it('prefers what this app just published over a relay that has not caught up', async () => {
    rememberPublished(profile('{"name":"new"}', 2000));
    fetchReplaceable.mockResolvedValueOnce({
      event: profile('{"name":"old"}', 1000),
      answered: ['wss://read.example'],
      failed: [],
    });
    const result = await fetchProfileBase(ME);
    expect(result.base?.content).toBe('{"name":"new"}');
    expect(result.answered).toBe(1);
    expect(result.asked).toBe(3);
  });
});
