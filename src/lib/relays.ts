import type { RelayMap } from 'nosskey-iframe';

/** Default relay set, used before login and as a fallback. */
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://yabu.me',
];

// NOTE: pass relay lists to nostr-web-components as an array property
// (relays={list}), not as a JSON attribute string: nostr-list@0.3.0
// does not parse a string and would treat each character as a relay URL.

/**
 * Pick the relays to read from out of a NIP-07 relay map (as returned by
 * nosskey-iframe `getRelays()`). Returns the user's read relays, falling back
 * to {@link DEFAULT_RELAYS} when the map is empty/missing or lists no readable
 * relay so views always have something to query.
 */
export function readRelaysFrom(map: RelayMap | null | undefined): string[] {
  if (!map) return DEFAULT_RELAYS;
  const reads = Object.entries(map)
    .filter(([, perms]) => perms.read)
    .map(([url]) => url);
  return reads.length > 0 ? reads : DEFAULT_RELAYS;
}
