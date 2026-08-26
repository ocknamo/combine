/**
 * Reposting a post (NIP-18): build the event, have Nosskey sign it, send it
 * through the page's cache relay (see {@link publishTargets}).
 *
 * This is combine's own write path. Posting is delegated to the eHagaki embed,
 * which publishes for itself, so nothing here existed until now (see
 * `TODO.md`).
 *
 * The signing iframe shows its own consent dialog for every signature, so a
 * press goes straight to it — a confirmation of combine's own in front of that
 * would be the same question asked twice.
 */
import { auth } from './auth.svelte';
import { cacheRelay } from './cacheRelay.svelte';
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
 * Where to send the repost: the in-page cache relay when one is running, the
 * user's write relays when there is none.
 *
 * The cache relay is write-through — an EVENT it takes is validated, stored in
 * IndexedDB, answered with `OK`, and then forwarded to the upstream relays it
 * was started with. So one socket to it does everything sending to each relay
 * would, and it does something they cannot: the repost is in the cache every
 * view reads through, so it is on screen without waiting for a relay to send it
 * back.
 *
 * The direct path is the same fallback the views have (see
 * `pickViewRelays`): with no cache relay there is nothing to read through, and
 * nothing to publish through either.
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
 * A dialog the user dismissed is not a failure to report — Nosskey rejects the
 * signature and the post simply does not happen.
 *
 * Through the cache relay, the `OK` says the repost was stored and handed on,
 * not that an upstream relay took it: the forward is fire-and-forget on the
 * relay's side. That is the write-through bargain — the same one the read path
 * makes — and a "sent" the user can see beats one they wait for.
 */
export async function repost(target: PostTarget): Promise<void> {
  const pubkey = auth.pubkey;
  if (!pubkey) {
    toast.show('リポストするにはログインが必要です。', 'error');
    return;
  }

  try {
    // The relays are settled before signing so the consent dialog is the last
    // thing between the press and the publish, not something waiting on a
    // network round trip after it.
    const relays = await publishTargets();
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
