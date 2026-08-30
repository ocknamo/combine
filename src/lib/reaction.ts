/**
 * Reacting to a post (NIP-25).
 *
 * Builds the event; the signing and the write are `publishOwn.ts`, shared with
 * reposts.
 */
import { auth } from './auth.svelte';
import type { PostTarget } from './postRef';
import { signAndPublish, type UnsignedEvent } from './publishOwn';
import { toast } from './toast.svelte';

/**
 * The content of a plain like. NIP-25 reads `+` as one, and every client that
 * shows reactions renders it as its own glyph — which is why combine sends this
 * rather than an emoji of its own picking, with no picker to choose another.
 */
const LIKE = '+';

/**
 * The reaction event for a post (NIP-25): `e` and `p` name what was reacted to
 * and its author, `k` the kind it was.
 *
 * `k` goes on every reaction, unlike the repost's, where it only marks the
 * generic kind 16 — here NIP-25 asks for it whatever the kind, so a client can
 * tell what it is aggregating without fetching the event.
 *
 * An addressable event is reacted to by the id on screen rather than its `a`
 * coordinate, and no relay hint goes on the `e` tag — same reasons as
 * `buildRepost`: the card carries no `d` identifier, and reads come through the
 * in-page cache, which never says which upstream an event came from.
 */
export function buildReaction(
  target: PostTarget,
  pubkey: string,
  now: number = Math.floor(Date.now() / 1000)
): UnsignedEvent {
  const tags: string[][] = [['e', target.id]];
  if (target.pubkey) tags.push(['p', target.pubkey]);
  tags.push(['k', String(target.kind)]);
  return {
    kind: 7,
    content: LIKE,
    tags,
    created_at: now,
    pubkey,
  };
}

/**
 * Sign and publish a reaction, telling the user how it went.
 *
 * A toast is the whole feedback: the button definition is one for the entire
 * list, so there is no per-post "reacted" state the card could take on. On the
 * single-post page the reaction shows up in the aggregate under the post, which
 * reads through the same cache the reaction was just written to.
 */
export async function react(target: PostTarget): Promise<void> {
  const pubkey = auth.pubkey;
  if (!pubkey) {
    toast.show('リアクションするにはログインが必要です。', 'error');
    return;
  }

  try {
    if (!(await signAndPublish(buildReaction(target, pubkey)))) {
      toast.show('リアクションに失敗しました', 'error');
      return;
    }
    toast.show('リアクションしました');
  } catch (err) {
    // Includes the user declining at nosskey.app — not worth a toast of its
    // own, they know what they just pressed.
    console.error('[combine] reaction failed:', err);
    toast.show('リアクションに失敗しました', 'error');
  }
}
