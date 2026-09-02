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
 * What every nostr-cache element (loaded by `lib/nostrCache.ts`) understands.
 * Separate from the Nostr Web Components attributes above: every value here is
 * a string, and `relays` is comma-separated rather than an array.
 *
 * The `show-*` and `debug` switches are on unless the value is the literal
 * string `false`, so `boolean` is allowed only because Svelte stringifies it to
 * exactly that — any other falsy-looking value would still read as on.
 */
type NostrCacheAttributes = HTMLAttributes<HTMLElement> & {
  relays?: string;
  'db-name'?: string;
  'profile-freshness'?: string;
  'follows-freshness'?: string;
  debug?: string | boolean;
  'show-avatars'?: string | boolean;
  'show-media'?: string | boolean;
  'show-embeds'?: string | boolean;
  /** JSON array of `{ id, label, icon?, … }`; see `lib/postRef.ts`. */
  actions?: string;
  /**
   * Makes a card's avatar and display name pressable, reporting the id given
   * here. Its taps arrive as the same `nostr-timeline:action` the buttons use,
   * with the pressed person's hex pubkey added as `pubkey` — a key that is
   * absent for a button press.
   */
  'author-action'?: string;
  /** Accessible name for the above. Defaults to 「プロフィールを開く」. */
  'author-action-label'?: string;
  /**
   * Makes the card of a quoted post — the one rendered inside another post's
   * body by `show-embeds` — pressable, reporting the id given here. Its taps
   * arrive as the same `nostr-timeline:action`, carrying the *quoted* event in
   * `event` and no `pubkey`.
   */
  'note-action'?: string;
  /** Accessible name for the above. Defaults to 「投稿を開く」. */
  'note-action-label'?: string;
  /**
   * CORS proxy for link previews: the element asks `{proxy}?url=<linked page>`
   * and reads the tags out of the HTML. Without it a link stays a plain link.
   * See `lib/nostrCache.ts` and `workers/ogp`.
   */
  'ogp-proxy'?: string;
  /**
   * Resizing proxy for images: attachments, avatars and OGP thumbnails are
   * loaded from `{proxy}/width=…,quality=…,format=webp/<original URL>`, the
   * element choosing the size per use. Without it every image comes straight
   * from where the author put it. See `lib/nostrCache.ts`.
   */
  'image-proxy'?: string;
  'material-icons'?: string | boolean;
  'material-icons-font'?: string;
};

type NostrCacheTimelineAttributes = NostrCacheAttributes & {
  filters?: string;
  kinds?: string;
  authors?: string;
  limit?: string;
  /** Deprecated alias for `debug`. */
  'show-origin'?: string | boolean;
};

type NostrCacheFollowTimelineAttributes = NostrCacheAttributes & {
  /** hex, npub or nprofile. Required — there is no default. */
  pubkey?: string;
  kinds?: string;
  limit?: string;
  'max-follows'?: string;
  'include-self'?: string | boolean;
  'since-days'?: string;
};

/**
 * One post as the subject of the page. `kind` here is the singular kind of a
 * `naddr`-style coordinate (`author` + `kind` + `identifier`), not the
 * timelines' `kinds` filter.
 */
type NostrCachePostAttributes = NostrCacheAttributes & {
  /** 64-hex, note1, nevent1 or naddr1. */
  'event-id'?: string;
  author?: string;
  kind?: string;
  identifier?: string;
  'show-reactions'?: string | boolean;
  'reactions-limit'?: string | number;
  'reactions-open'?: string | boolean;
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
    'nostr-post': NostrCachePostAttributes;
  }
}
