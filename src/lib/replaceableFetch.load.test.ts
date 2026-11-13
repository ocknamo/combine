import { describe, expect, it, vi } from 'vitest';

// The verifier is a separate chunk; after a deploy an open tab can ask for one
// that is gone. That has to come back as "nobody answered", never a rejection.
vi.mock('./verifyEvent', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

const { fetchReplaceable } = await import('./replaceableFetch');

describe('fetchReplaceable when the verifier will not load', () => {
  it('resolves with every relay failed, and opens no socket', async () => {
    const createSocket = vi.fn();
    const result = await fetchReplaceable(
      { kind: 3, parse: () => null, pickLatest: () => null },
      'a'.repeat(64),
      ['wss://a', 'wss://b'],
      { createSocket }
    );

    expect(result.event).toBeNull();
    expect(result.answered).toEqual([]);
    expect(result.failed.map((f) => f.relay)).toEqual(['wss://a', 'wss://b']);
    expect(createSocket).not.toHaveBeenCalled();
  });
});
