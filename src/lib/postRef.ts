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

/** Opens the editor with this post as the reply target (see `postAction.ts`). */
export const POST_REPLY_ACTION = {
  id: 'reply',
  label: '返信',
  icon: 'reply',
} as const;

/** Signs and publishes a repost of this post (NIP-18; see `repost.ts`). */
export const POST_REPOST_ACTION = {
  id: 'repost',
  label: 'リポスト',
  icon: 'repeat',
} as const;

/** Hands this post's page URL to the OS share sheet (see `share.ts`). */
export const POST_SHARE_ACTION = {
  id: 'share',
  label: '共有',
  icon: 'share',
} as const;

/** The `material-icons` variant every action-bearing element uses. */
export const MATERIAL_ICONS = 'outlined';

/**
 * The `actions` attribute value for a list. One definition for every list in
 * the app.
 *
 * 詳細 sits last because it is the one that leaves the timeline; the three
 * before it act on the post where it is. nostr-cache fits at most eight in a
 * row and drops the rest, which the test guards.
 *
 * Every button is rendered for every post — the widget takes one definition for
 * the whole list — so there is no "already reposted" state to show and nothing
 * to disable per post.
 */
export const POST_ACTIONS_ATTR = JSON.stringify([
  POST_REPLY_ACTION,
  POST_REPOST_ACTION,
  POST_SHARE_ACTION,
  POST_DETAIL_ACTION,
]);

/**
 * The same row for the detail page, without 詳細 — it would only lead back to
 * the page it was pressed on.
 */
export const POST_PAGE_ACTIONS_ATTR = JSON.stringify([
  POST_REPLY_ACTION,
  POST_REPOST_ACTION,
  POST_SHARE_ACTION,
]);

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

/**
 * The value of the last tag of `name`, or `null`.
 *
 * The last one is the reacted-to event (`e`) and its author (`p`) under both
 * NIP-10's positional scheme and the marked one.
 */
function lastTagValue(tags: unknown, name: string): string | null {
  if (!Array.isArray(tags)) return null;
  for (let i = tags.length - 1; i >= 0; i -= 1) {
    const tag = tags[i];
    if (!Array.isArray(tag) || tag[0] !== name) continue;
    if (typeof tag[1] === 'string' && tag[1]) return tag[1];
  }
  return null;
}

/** The post an action was pressed for: what to reply to, repost or share. */
export interface PostTarget {
  /** Hex event id, or a bech32 reference when that is all the card carried. */
  id: string;
  /** Hex pubkey of the author, or `null` when the card did not say. */
  pubkey: string | null;
  kind: number;
}

/**
 * Which post a `nostr-timeline:action` detail is about, or `null` to ignore it.
 *
 * Reads defensively: the detail crosses a shadow boundary from a script this
 * app does not build.
 *
 * A repost, a reaction or a zap receipt is not the post the user meant —
 * notifications is full of them, and replying to one would answer a `+`. Those
 * resolve to what they refer to, which the tags carry as far as they go: the
 * event id and its author, but not its kind, so kind 1 is assumed (the only
 * kind the app's own lists ask for). One that names no event falls through to
 * itself: it is still an event, and a button that does nothing is worse than a
 * button that acts on the card it sits under.
 */
export function actionTarget(detail: unknown): PostTarget | null {
  if (typeof detail !== 'object' || detail === null) return null;
  const event = (detail as Record<string, unknown>)['event'];
  if (typeof event !== 'object' || event === null) return null;
  const record = event as Record<string, unknown>;

  const kind = record['kind'];
  if (typeof kind === 'number' && REFERRING_KINDS.has(kind)) {
    const referenced = lastTagValue(record['tags'], 'e');
    if (referenced) {
      return { id: referenced, pubkey: lastTagValue(record['tags'], 'p'), kind: 1 };
    }
  }

  const id = record['id'];
  if (typeof id !== 'string' || !id) return null;
  const pubkey = record['pubkey'];
  return {
    id,
    pubkey: typeof pubkey === 'string' && pubkey ? pubkey : null,
    kind: typeof kind === 'number' ? kind : 1,
  };
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
  // land in the same resolution below and reach `#/post/…` the same way. The
  // three buttons next to 詳細 act on the post rather than navigating, so they
  // are not this function's business (see `postAction.ts`).
  const actionId = record['actionId'];
  if (actionId !== POST_DETAIL_ACTION.id && actionId !== NOTE_ACTION_ID) return null;

  const target = actionTarget(detail);
  const ref = normalizePostRef(target?.id);
  return ref ? postPath(ref) : null;
}
