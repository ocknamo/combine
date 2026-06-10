import type { HTMLAttributes } from 'svelte/elements';

type NostrElementAttributes = HTMLAttributes<HTMLElement> & {
  relays?: string;
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

declare module 'svelte/elements' {
  interface SvelteHTMLElements {
    'nostr-container': NostrElementAttributes;
    'nostr-note': NostrElementAttributes;
    'nostr-profile': NostrElementAttributes;
    'nostr-list': NostrElementAttributes;
    'nostr-stream': NostrElementAttributes;
    'nostr-naddr': NostrElementAttributes;
  }
}
