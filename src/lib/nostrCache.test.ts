import { describe, expect, it } from 'vitest';
import {
  NOSTR_CACHE_DB_NAME,
  NOSTR_CACHE_ORIGIN,
  NOSTR_CACHE_SCRIPT_URL,
  relaysAttr,
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
