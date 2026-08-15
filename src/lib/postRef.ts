/**
 * What a post reference is, where it lives in the URL, and how a tap on a
 * timeline's action button turns into one.
 *
 * Imports nothing on purpose: the router touches `location` at module scope and
 * the suite runs without a DOM, so anything reachable from a test has to stay
 * clear of it. The Svelte action that actually navigates lives in
 * `postAction.ts`.
 */

const HEX64 = /^[0-9a-f]{64}$/;
/** bech32 without the four characters its alphabet leaves out (1, b, i, o). */
const EVENT_BECH32 = /^(?:note|nevent|naddr)1[02-9ac-hj-np-z]+$/;

/**
 * A reference `<nostr-post event-id>` will accept, lowercased, or `null`.
 *
 * Lowercasing is safe for both forms: bech32 is case-insensitive and the
 * element's own hex path lowercases too. `npub` / `nprofile` are rejected here
 * rather than passed through — they name a person, and the element would only
 * refuse them itself.
 */
export function normalizePostRef(value: string | null | undefined): string | null {
  if (!value) return null;
  const ref = value.trim().toLowerCase();
  if (HEX64.test(ref) || EVENT_BECH32.test(ref)) return ref;
  return null;
}

/** Hash path of the detail page for a reference. Paired with `parseRoute`. */
export function postPath(ref: string): string {
  return `/post/${encodeURIComponent(ref)}`;
}

/**
 * The button nostr-cache renders under every post in a timeline.
 *
 * No icon: the element would want either an emoji glyph or the Material Icons
 * font, and the app loads neither.
 */
export const POST_DETAIL_ACTION = { id: 'detail', label: '詳細' } as const;

/** The `actions` attribute value. One definition for every list in the app. */
export const POST_ACTIONS_ATTR = JSON.stringify([POST_DETAIL_ACTION]);

/** The event all three nostr-cache elements dispatch when an action is used. */
export const POST_ACTION_EVENT = 'nostr-timeline:action';

/**
 * Events whose subject is another event: a repost, a reaction, a zap receipt.
 * Notifications is full of them, and opening one as a post would show a card
 * whose body is `+`. Follow the `e` tag to what was reacted to instead.
 */
const REFERRING_KINDS = new Set([6, 7, 9735]);

function referencedEventId(tags: unknown): string | null {
  if (!Array.isArray(tags)) return null;
  // The last `e` tag, which is the reacted-to event under both NIP-10's
  // positional scheme and the marked one.
  for (let i = tags.length - 1; i >= 0; i -= 1) {
    const tag = tags[i];
    if (!Array.isArray(tag) || tag[0] !== 'e') continue;
    if (typeof tag[1] === 'string' && tag[1]) return tag[1];
  }
  return null;
}

/**
 * Where a `nostr-timeline:action` detail should navigate, or `null` to ignore
 * it. Reads defensively: the detail crosses a shadow boundary from a script
 * this app does not build.
 */
export function postActionPath(detail: unknown): string | null {
  if (typeof detail !== 'object' || detail === null) return null;
  const record = detail as Record<string, unknown>;
  if (record['actionId'] !== POST_DETAIL_ACTION.id) return null;

  const event = record['event'];
  if (typeof event !== 'object' || event === null) return null;
  const nostrEvent = event as Record<string, unknown>;

  const kind = nostrEvent['kind'];
  const target =
    (typeof kind === 'number' && REFERRING_KINDS.has(kind)
      ? referencedEventId(nostrEvent['tags'])
      : null) ?? nostrEvent['id'];

  const ref = normalizePostRef(typeof target === 'string' ? target : null);
  return ref ? postPath(ref) : null;
}
