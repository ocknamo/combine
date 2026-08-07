import type { HTMLAttributes } from 'svelte/elements';

type NostrElementAttributes = HTMLAttributes<HTMLElement> & {
  relays?: string | string[];
  filters?: string;
  theme?: string;
  limit?: string | number;
  nevent?: string;
  user?: string;
  naddr?: string;
  display?: string;
  href?: string;
  target?: string;
  height?: string;
  nolink?: string | boolean;
};

/**
 * nostr-cache's timeline widget (loaded by `lib/nostrCache.ts`). Separate from
 * the Nostr Web Components attributes above: every value here is a string, and
 * `relays` is comma-separated rather than an array.
 */
type NostrCacheAttributes = HTMLAttributes<HTMLElement> & {
  relays?: string;
  kinds?: string;
  limit?: string;
  'db-name'?: string;
  'profile-freshness'?: string;
  'follows-freshness'?: string;
  debug?: string | boolean;
  'show-avatars'?: string;
  'show-media'?: string;
};

type NostrCacheTimelineAttributes = NostrCacheAttributes & {
  filters?: string;
  authors?: string;
};

type NostrCacheFollowTimelineAttributes = NostrCacheAttributes & {
  /** hex, npub or nprofile. Required — there is no default. */
  pubkey?: string;
  'max-follows'?: string;
  'include-self'?: string | boolean;
  'since-days'?: string;
};

declare module 'svelte/elements' {
  interface SvelteHTMLElements {
    'nostr-container': NostrElementAttributes;
    'nostr-note': NostrElementAttributes;
    'nostr-profile': NostrElementAttributes;
    'nostr-list': NostrElementAttributes;
    'nostr-stream': NostrElementAttributes;
    'nostr-naddr': NostrElementAttributes;
    'nostr-timeline': NostrCacheTimelineAttributes;
    'nostr-follow-timeline': NostrCacheFollowTimelineAttributes;
  }
}
