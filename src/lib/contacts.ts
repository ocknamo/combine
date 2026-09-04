/**
 * The contact list (NIP-02 kind 3), and the arithmetic of changing one safely.
 *
 * kind 3 is replaceable: what is published does not add to the list, it *is*
 * the list. Publishing one built on a base we failed to fetch — or on a stale
 * one — silently unfollows everyone the base was missing. So every decision
 * that guards against that lives here, as pure functions with no relay, no
 * signer and no DOM, because these are the ones worth testing exhaustively.
 *
 * The reading and the writing are `contactsFetch.ts` and `follows.svelte.ts`.
 */
import type { UnsignedEvent } from './publishOwn';

/**
 * A contact list as a relay hands it over. No `id` or `sig`: nothing here
 * verifies a signature (combine has no Nostr library to do it with), so
 * carrying them would only suggest otherwise.
 */
export interface ContactList {
  kind: 3;
  pubkey: string;
  created_at: number;
  content: string;
  tags: string[][];
}

/** Adding or removing exactly one person. */
export type ContactChange = { add: string } | { remove: string };

/** The hex pubkey a change is about, whichever kind of change it is. */
export function changeTarget(change: ContactChange): string {
  return 'add' in change ? change.add : change.remove;
}

/**
 * A relay's frame read as *this* person's contact list, or `null`.
 *
 * A relay is free to answer with anything, and what comes back becomes the base
 * of an event that replaces the user's follows — so someone else's list, another
 * kind, or a malformed shape has to be refused here rather than trusted because
 * it arrived on the socket we opened.
 */
export function asContactList(value: unknown, pubkey: string): ContactList | null {
  if (typeof value !== 'object' || value === null) return null;
  const event = value as Record<string, unknown>;
  if (event['kind'] !== 3) return null;
  if (event['pubkey'] !== pubkey) return null;
  if (typeof event['created_at'] !== 'number' || !Number.isFinite(event['created_at'])) return null;
  if (typeof event['content'] !== 'string') return null;
  const tags = event['tags'];
  if (!Array.isArray(tags)) return null;
  if (!tags.every((tag) => Array.isArray(tag) && tag.every((v) => typeof v === 'string'))) {
    return null;
  }
  return {
    kind: 3,
    pubkey,
    created_at: event['created_at'],
    content: event['content'],
    tags: tags as string[][],
  };
}

/**
 * The newest of what several relays answered, ignoring the ones that failed.
 *
 * Newest wins because that is what every relay will keep anyway: a replaceable
 * event with a lower `created_at` is dropped. A relay still serving last week's
 * list is therefore harmless as long as one other relay has the current one.
 */
export function pickLatest(events: (ContactList | null)[]): ContactList | null {
  let best: ContactList | null = null;
  for (const event of events) {
    if (event && (!best || event.created_at > best.created_at)) best = event;
  }
  return best;
}

/**
 * The people a list follows, as lowercase hex.
 *
 * This is how the list is *counted*, and deliberately not how tags are edited:
 * lists in the wild carry `p` tags holding an npub, an uppercase hex or plain
 * junk, and dropping those while rewriting the list would unfollow whoever they
 * stand for. They are left in place by {@link buildContacts} and merely not
 * counted here.
 */
export function followedPubkeys(base: { tags: string[][] } | null): Set<string> {
  const follows = new Set<string>();
  if (!base) return follows;
  for (const tag of base.tags) {
    if (tag[0] !== 'p') continue;
    const value = tag[1];
    if (typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)) follows.add(value);
  }
  return follows;
}

/**
 * When the replacement should claim to have been created.
 *
 * A relay keeps the newer of two contact lists and drops the other, so an event
 * stamped at or before the base is thrown away — which is exactly what a device
 * whose clock is a few minutes slow would produce, and it would look like the
 * follow simply never happened. Stepping past the base guarantees the write
 * lands; when the clock is fine `now` is already past it and nothing changes.
 */
export function nextCreatedAt(base: ContactList | null, now: number): number {
  return Math.max(now, (base?.created_at ?? 0) + 1);
}

/**
 * The contact list that follows — or stops following — one more person.
 *
 * Everything but the one `p` tag is carried over untouched, and that is the
 * whole point of the function:
 *
 *  - `content` holds a relay list on lists written by older clients (the
 *    deprecated NIP-02 field), and blanking it would take someone's relays with
 *    the follow;
 *  - tags that are not `p` (`t` topic follows, a client's own) keep their
 *    positions;
 *  - a `p` tag is copied whole, so the relay hint and petname in its third and
 *    fourth elements survive.
 *
 * A `base` of `null` builds a brand new list. Only a caller that has established
 * the user really has none may pass it — see `follows.svelte.ts`.
 */
export function buildContacts(
  base: ContactList | null,
  change: ContactChange,
  pubkey: string,
  now: number = Math.floor(Date.now() / 1000)
): UnsignedEvent {
  const target = changeTarget(change);
  const tags = (base?.tags ?? []).map((tag) => [...tag]);

  let next: string[][];
  if ('add' in change) {
    next = followedPubkeys(base).has(target) ? tags : [...tags, ['p', target]];
  } else {
    // Every matching tag, not the first: a list with the same person twice
    // would otherwise lose no follower at all, and `checkContactsDiff` would
    // refuse the publish forever after.
    next = tags.filter((tag) => !(tag[0] === 'p' && tag[1] === target));
  }

  return {
    kind: 3,
    content: base?.content ?? '',
    tags: next,
    created_at: nextCreatedAt(base, now),
    pubkey,
  };
}

/**
 * The last gate before signing: why this replacement must not be published, or
 * `null` when it may be.
 *
 * Every rule here describes a way the built event could destroy follows that a
 * bug, a stale base or a hostile relay put within reach. A reason comes back as
 * a string rather than a boolean so the caller can log which one tripped — the
 * user only ever needs to hear that it did not work.
 */
export function checkContactsDiff(
  base: ContactList | null,
  next: UnsignedEvent,
  change: ContactChange
): string | null {
  if (next.kind !== 3) return `kind ${next.kind} は contact list ではありません`;

  const before = followedPubkeys(base);
  const after = followedPubkeys(next);
  const delta = after.size - before.size;
  const target = changeTarget(change);

  if ('add' in change) {
    if (delta !== 1) return `フォロー追加なのに人数が ${delta} 人変化しました`;
    if (!after.has(target)) return '追加した相手がリストに入っていません';
  } else {
    if (delta !== -1) return `フォロー解除なのに人数が ${delta} 人変化しました`;
    if (after.has(target)) return '解除した相手がリストに残っています';
  }

  // Everyone else must be untouched — a ±1 count could still hide one person
  // swapped for another.
  for (const hex of before) {
    if (hex !== target && !after.has(hex)) return `別の相手 ${hex.slice(0, 8)}… が消えています`;
  }

  const otherTags = (tags: string[][]) => tags.filter((tag) => tag[0] !== 'p').length;
  if (base && otherTags(next.tags) !== otherTags(base.tags)) {
    return 'p 以外のタグが失われています';
  }
  if (base && next.content !== base.content) return 'content が書き換わっています';
  // Would be dropped by the relays as older than what they already hold.
  if (base && next.created_at <= base.created_at) return 'created_at がベースより古い状態です';
  if (base && next.pubkey !== base.pubkey) return 'ベースが別のアカウントのものです';
  // Nothing legitimately empties a list of several people one follow at a time.
  if (base && after.size === 0 && before.size > 1) return 'フォローが全て消えようとしています';

  return null;
}
