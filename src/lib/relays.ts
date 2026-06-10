/** Default relay set shared by every view. */
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://yabu.me',
];

/** JSON form for nostr-web-components `relays` attributes. */
export const RELAYS_ATTR = JSON.stringify(DEFAULT_RELAYS);
