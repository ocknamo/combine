/**
 * Reposting a post (NIP-18).
 *
 * Builds the event; the signing and the write are `publishOwn.ts`, shared with
 * reactions.
 */
import { auth } from './auth.svelte';
import type { PostTarget } from './postRef';
import { signAndPublish, type UnsignedEvent } from './publishOwn';
import { toast } from './toast.svelte';

/**
 * The repost event for a post: kind 6 for a note, the generic kind 16 with a
 * `k` tag for anything else (NIP-18).
 *
 * `content` stays empty although NIP-18 allows the reposted event there: what
 * the widget hands over is a card's worth of data that may no longer verify,
 * and a reader that cannot check the signature has to fetch the original anyway.
 * For the same reason an addressable event is reposted by the id on screen
 * rather than its `a` coordinate — the card carries no `d` identifier.
 *
 * No relay hint on the `e` tag: reads go through the in-page cache, which never
 * says which upstream an event came from, so any relay named here would be a
 * guess.
 */
export function buildRepost(
  target: PostTarget,
  pubkey: string,
  now: number = Math.floor(Date.now() / 1000)
): UnsignedEvent {
  const tags: string[][] = [['e', target.id]];
  if (target.pubkey) tags.push(['p', target.pubkey]);
  if (target.kind !== 1) tags.push(['k', String(target.kind)]);
  return {
    kind: target.kind === 1 ? 6 : 16,
    content: '',
    tags,
    created_at: now,
    pubkey,
  };
}

/**
 * Sign and publish a repost, telling the user how it went.
 *
 * Toasts rather than a screen of its own: the press happened on a card in a
 * list the user is still reading, and nothing else about that list changes.
 */
export async function repost(target: PostTarget): Promise<void> {
  const pubkey = auth.pubkey;
  if (!pubkey) {
    toast.show('リポストするにはログインが必要です。', 'error');
    return;
  }

  try {
    if (!(await signAndPublish(buildRepost(target, pubkey)))) {
      toast.show('リポストに失敗しました', 'error');
      return;
    }
    toast.show('リポストしました');
  } catch (err) {
    // Includes the user declining at nosskey.app — not worth a toast of its
    // own, they know what they just pressed.
    console.error('[combine] repost failed:', err);
    toast.show('リポストに失敗しました', 'error');
  }
}
