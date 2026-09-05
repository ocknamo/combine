/**
 * The contact list (NIP-02 kind 3), and the arithmetic of changing one safely.
 *
 * kind 3 is replaceable: what is published *is* the list. Build one on a base
 * that was stale or never fetched and everyone it was missing is unfollowed.
 * The guards against that live here as pure functions, so they can be tested
 * exhaustively; the read and the write are `contactsFetch.ts` / `follows.svelte.ts`.
 */
import type { UnsignedEvent } from './publishOwn';

/** No `id` or `sig`: combine cannot verify a signature, so it does not carry one. */
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
 * What comes back becomes the base of an event that replaces the user's
 * follows, and a relay may answer with anything at all.
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
 * The newest of what several relays answered, ignoring those that failed.
 *
 * A relay stuck on last week's list is harmless as long as one other has the
 * current one.
 */
export function pickLatest(events: (ContactList | null)[]): ContactList | null {
  let best: ContactList | null = null;
  for (const event of events) {
    if (event && (!best || event.created_at > best.created_at)) best = event;
  }
  return best;
}

/**
 * How the list is *counted* — deliberately not how tags are edited.
 *
 * `p` tags in the wild hold npubs, uppercase hex and junk. {@link buildContacts}
 * leaves those in place; dropping them would unfollow whoever they stand for.
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
 * Relays drop the older of two contact lists, so a device with a slow clock
 * would publish a follow that silently never happened. Step past the base.
 */
export function nextCreatedAt(base: ContactList | null, now: number): number {
  return Math.max(now, (base?.created_at ?? 0) + 1);
}

/**
 * The contact list that follows — or stops following — one more person.
 *
 * Carrying everything else over untouched is the whole point: `content` holds a
 * relay list on lists from older clients, and each `p` tag is copied whole so
 * its relay hint and petname survive.
 *
 * A `null` base builds a new list, and only a caller that has established there
 * is none may pass it (`follows.svelte.ts`).
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
    // Every match, not the first: a duplicated `p` tag would otherwise leave
    // the count unchanged and `checkContactsDiff` would refuse it forever.
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
 * The last gate before signing: why this must not be published, or `null`.
 *
 * Each rule is a way a bug, a stale base or a hostile relay could destroy
 * follows. A string rather than a boolean so the caller can log which tripped.
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

  // A ±1 count could still hide one person swapped for another.
  for (const hex of before) {
    if (hex !== target && !after.has(hex)) return `別の相手 ${hex.slice(0, 8)}… が消えています`;
  }

  const otherTags = (tags: string[][]) => tags.filter((tag) => tag[0] !== 'p').length;
  if (base && otherTags(next.tags) !== otherTags(base.tags)) {
    return 'p 以外のタグが失われています';
  }
  if (base && next.content !== base.content) return 'content が書き換わっています';
  if (base && next.created_at <= base.created_at) return 'created_at がベースより古い状態です';
  if (base && next.pubkey !== base.pubkey) return 'ベースが別のアカウントのものです';
  if (base && after.size === 0 && before.size > 1) return 'フォローが全て消えようとしています';

  return null;
}
