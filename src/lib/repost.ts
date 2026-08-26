/**
 * Reposting a post (NIP-18).
 *
 * The one thing combine publishes itself: ordinary posts are the eHagaki
 * embed's, which signs through the shim and sends them on its own.
 *
 * A press goes straight to the signer — nosskey.app gates every signature
 * behind its own consent dialog, so asking first would ask twice.
 */
import { auth } from './auth.svelte';
import { cacheRelay } from './cacheRelay.svelte';
import type { PostTarget } from './postRef';
import { publishEvent } from './publish';
import { toast } from './toast.svelte';

/** A Nostr event before it has been signed, as the signer takes it. */
interface UnsignedEvent {
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
  pubkey: string;
}

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
 * Where to send the repost.
 *
 * The cache relay is write-through: it validates the event, stores it, answers
 * `OK` and forwards it to its upstreams itself. So one socket to it does what
 * sending to every relay would, and puts the repost in the cache the views read
 * through — on screen without waiting for a relay to send it back.
 *
 * Falling back to the write relays is the same fallback the views make when
 * there is no cache relay to read through (see `pickViewRelays`).
 */
async function publishTargets(): Promise<string[]> {
  const intercept = cacheRelay.interceptUrl;
  return intercept ? [intercept] : await auth.getWriteRelays();
}

/**
 * Sign and publish a repost, telling the user how it went.
 *
 * Toasts rather than a screen of its own: the press happened on a card in a
 * list the user is still reading, and nothing else about that list changes.
 *
 * Through the cache relay the `OK` means stored and handed on, not accepted
 * upstream — the relay forwards fire-and-forget. That is the write-through
 * bargain the read path already makes.
 */
export async function repost(target: PostTarget): Promise<void> {
  const pubkey = auth.pubkey;
  if (!pubkey) {
    toast.show('リポストするにはログインが必要です。', 'error');
    return;
  }

  try {
    // Before signing, so the consent dialog is the last thing between the press
    // and the publish rather than a network round trip after it.
    const relays = await publishTargets();
    const signed = await auth.signEvent(buildRepost(target, pubkey));
    // Optional in the signer's type because it takes unsigned events too.
    if (!signed.id) throw new Error('signed event has no id');
    const result = await publishEvent({ ...signed, id: signed.id }, relays);
    if (result.accepted.length === 0) {
      console.error('[combine] repost rejected by every relay:', result.rejected);
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
