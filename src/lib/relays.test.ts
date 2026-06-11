import { describe, expect, it } from 'vitest';
import { DEFAULT_RELAYS, readRelaysFrom } from './relays';

describe('readRelaysFrom', () => {
  it('falls back to defaults for a missing map', () => {
    expect(readRelaysFrom(null)).toBe(DEFAULT_RELAYS);
    expect(readRelaysFrom(undefined)).toBe(DEFAULT_RELAYS);
  });

  it('returns the read relays from the map', () => {
    const relays = readRelaysFrom({
      'wss://a.example': { read: true, write: true },
      'wss://b.example': { read: true, write: false },
    });
    expect(relays).toEqual(['wss://a.example', 'wss://b.example']);
  });

  it('keeps only readable relays', () => {
    const relays = readRelaysFrom({
      'wss://read.example': { read: true, write: false },
      'wss://write.example': { read: false, write: true },
    });
    expect(relays).toEqual(['wss://read.example']);
  });

  it('falls back to defaults when no relay is readable', () => {
    expect(readRelaysFrom({})).toBe(DEFAULT_RELAYS);
    expect(readRelaysFrom({ 'wss://write.example': { read: false, write: true } })).toBe(
      DEFAULT_RELAYS
    );
  });
});
