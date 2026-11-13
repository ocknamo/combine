import { describe, expect, it, vi } from 'vitest';

// A chunk request that never completes must not hold a follow or a profile
// edit forever: it is given the same time as a relay.
vi.mock('./verifyEvent', () => new Promise(() => {}));

const { fetchReplaceable } = await import('./replaceableFetch');

describe('fetchReplaceable when the verifier never loads', () => {
  it('gives up after the relay timeout, with every relay failed', async () => {
    const createSocket = vi.fn();
    const result = await fetchReplaceable(
      { kind: 3, parse: () => null, pickLatest: () => null },
      'a'.repeat(64),
      ['wss://a'],
      { createSocket, timeoutMs: 50 }
    );

    expect(result.answered).toEqual([]);
    expect(result.failed.map((f) => f.relay)).toEqual(['wss://a']);
    expect(createSocket).not.toHaveBeenCalled();
  });
});
