/** Default relay set shared by every view. */
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://yabu.me',
];

// NOTE: pass DEFAULT_RELAYS to nostr-web-components as an array property
// (relays={DEFAULT_RELAYS}), not as a JSON attribute string: nostr-list@0.3.0
// does not parse a string and would treat each character as a relay URL.
