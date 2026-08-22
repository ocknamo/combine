/**
 * What a post or a person looks like in the URL, and how a tap on a timeline
 * turns into one.
 *
 * Imports nothing that reaches the DOM on purpose: the router touches
 * `location` at module scope and the suite runs without a DOM, so anything
 * reachable from a test has to stay clear of it. `nip19` is pure arithmetic and
 * safe. The Svelte action that actually navigates lives in `postAction.ts`.
 */
import { toHexPubkey, toNpub } from './nip19';

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

/** Hash path of a person's page. Paired with `parseRoute`. */
export function userPath(ref: string): string {
  return `/user/${encodeURIComponent(ref)}`;
}

/**
 * The button nostr-cache renders under every post in a timeline.
 *
 * `icon` is a Material Symbols ligature name; the element only renders it as
 * a glyph on a host that also sets `material-icons` (see `MATERIAL_ICONS`
 * below), which is what pulls in the Google Fonts stylesheet. `label` still
 * carries the accessible name either way.
 */
export const POST_DETAIL_ACTION = {
  id: 'detail',
  label: '詳細',
  icon: 'open_in_full',
} as const;

/** The `material-icons` variant every action-bearing element uses. */
export const MATERIAL_ICONS = 'outlined';

/** The `actions` attribute value. One definition for every list in the app. */
export const POST_ACTIONS_ATTR = JSON.stringify([POST_DETAIL_ACTION]);

/**
 * The `author-action` attribute value: what a tap on a card's avatar or display
 * name reports itself as.
 *
 * nostr-cache reserves no id of its own for this — the attribute *is* the
 * opt-in, and its value is ours to pick, so it only has to differ from every id
 * in `POST_ACTIONS_ATTR`. The accessible name is left at the element's default
 * (「プロフィールを開く」), which is exactly where this goes.
 */
export const AUTHOR_ACTION_ID = 'open-profile';

/**
 * The `note-action` attribute value: what a tap on a quoted post's card inside
 * another post reports itself as.
 *
 * Same shape of opt-in as `author-action` — nostr-cache reserves no id, so this
 * only has to differ from `AUTHOR_ACTION_ID` and from every id in
 * `POST_ACTIONS_ATTR`. The accessible name is left at the element's default
 * (「投稿を開く」), which is exactly what pressing one does.
 *
 * The press arrives with the *quoted* event in `event` and no `pubkey` key, so
 * `actionPath` resolves it the same way it resolves the 詳細 button.
 */
export const NOTE_ACTION_ID = 'open-note';

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
export function actionPath(detail: unknown): string | null {
  if (typeof detail !== 'object' || detail === null) return null;
  const record = detail as Record<string, unknown>;

  // A tap on the author's avatar or display name. The person pressed comes from
  // `pubkey`, which nostr-cache adds for this press alone — deliberately not
  // from `event.pubkey`, so the link stays right if the widget ever extends the
  // same press to a quote's header or a reactor row, where the person pressed
  // is not the event's author. npub in the URL because it is the form a user
  // can read and share; `parseRoute` takes hex and nprofile just as well.
  if (record['actionId'] === AUTHOR_ACTION_ID) {
    const pubkey = record['pubkey'];
    // Documented as hex, normalised anyway: it costs one call, and it is the
    // difference between tolerating an npub here and dropping the tap silently.
    const hex = typeof pubkey === 'string' ? toHexPubkey(pubkey) : null;
    const npub = hex ? toNpub(hex) : null;
    return npub ? userPath(npub) : null;
  }

  // The 詳細 button and a tap on a quoted card differ only in which event they
  // carry — the button the post's own, the quote the post it embeds — so both
  // land in the same resolution below and reach `#/post/…` the same way.
  const actionId = record['actionId'];
  if (actionId !== POST_DETAIL_ACTION.id && actionId !== NOTE_ACTION_ID) return null;

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
