/**
 * Reposting a post (NIP-18): build the event, have Nosskey sign it, send it to
 * the user's write relays.
 *
 * The write relays get their first use here. Posting is delegated to the
 * eHagaki embed, which picks its own relays, so `getRelays()`'s write side has
 * had nothing to do until now (see `TODO.md`).
 *
 * The signing iframe shows its own consent dialog for every signature, so a
 * press goes straight to it — a confirmation of combine's own in front of that
 * would be the same question asked twice.
 */
import { auth } from './auth.svelte';
import type { PostTarget } from './postRef';
import { publishEvent } from './publish';
import { toast } from './toast.svelte';

/** A Nostr event before it has been signed, as the signer takes it. */
export interface UnsignedEvent {
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
  pubkey: string;
}

/**
 * The repost event for a post.
 *
 * NIP-18 gives kind 1 its own kind (6) and everything else the generic repost
 * (16), which names what it wrapped in a `k` tag. `content` is left empty
 * rather than carrying the reposted event: NIP-18 allows the stringified event
 * there, but what arrives from the widget is a card's worth of data that may
 * not still be a verifiable event, and a reader that cannot check a signature
 * has to fetch the original anyway.
 *
 * An addressable event (a long-form post, say) is reposted by the id of the
 * version on screen rather than by its `a` coordinate: the card does not carry
 * its `d` identifier, and only the detail page can show one at all — the app's
 * own lists ask for kind 1.
 *
 * No relay hint on the `e` tag: NIP-18 wants the relay the original can be
 * found on, and combine does not know it — the widget reads through the in-page
 * cache and never reports which upstream an event came from. Naming one of the
 * user's own relays instead would be a hint pointing at the wrong place.
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
 * A dialog the user dismissed is not a failure to report — Nosskey rejects the
 * signature and the post simply does not happen.
 */
export async function repost(target: PostTarget): Promise<void> {
  const pubkey = auth.pubkey;
  if (!pubkey) {
    toast.show('リポストするにはログインが必要です。', 'error');
    return;
  }

  try {
    // The relays are fetched before signing so the consent dialog is the last
    // thing between the press and the publish, not something waiting on a
    // network round trip after it.
    const relays = await auth.getWriteRelays();
    const signed = await auth.signEvent(buildRepost(target, pubkey));
    // The signer types `id` as optional (it takes unsigned events too), and an
    // event with no id is one no relay can answer `OK` for.
    if (!signed.id) throw new Error('signed event has no id');
    const result = await publishEvent({ ...signed, id: signed.id }, relays);
    if (result.accepted.length === 0) {
      console.error('[combine] repost rejected by every relay:', result.rejected);
      toast.show('リポストに失敗しました', 'error');
      return;
    }
    toast.show('リポストしました');
  } catch (err) {
    // Includes the user declining at nosskey.app, which is not worth a toast of
    // its own: they know what they just pressed.
    console.error('[combine] repost failed:', err);
    toast.show('リポストに失敗しました', 'error');
  }
}
