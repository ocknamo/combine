/**
 * The path combine's own events take: sign at the Nosskey iframe, then write.
 *
 * Ordinary posts are not this — they are the eHagaki embed's, which signs
 * through the shim and sends them itself. What comes through here is what
 * combine builds: a repost (`repost.ts`), a reaction (`reaction.ts`).
 *
 * A press goes straight to the signer — nosskey.app gates every signature
 * behind its own consent dialog, so asking first would ask twice.
 */
import { auth } from './auth.svelte';
import { cacheRelay } from './cacheRelay.svelte';
import { publishEvent } from './publish';

/** A Nostr event before it has been signed, as the signer takes it. */
export interface UnsignedEvent {
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
  pubkey: string;
}

export interface PublishOwnOptions {
  /**
   * Also send straight to the user's write relays, on top of the cache relay.
   *
   * For an event combine cannot afford to have land nowhere. The cache relay
   * forwards to the upstreams it was started with, which are the user's *read*
   * relays (`App.svelte`), so someone whose read and write sets differ would
   * otherwise never see this event reach the relays they publish from.
   * Duplicates cost nothing: it is one event id, and a relay that already has
   * it answers `OK` again.
   */
  writeRelays?: boolean;
}

/**
 * Where to send an event of our own.
 *
 * The cache relay is write-through: it validates the event, stores it, answers
 * `OK` and forwards it to its upstreams itself. So one socket to it does what
 * sending to every relay would, and puts the event in the cache the views read
 * through — on screen without waiting for a relay to send it back.
 *
 * Falling back to the write relays is the same fallback the views make when
 * there is no cache relay to read through (see `pickViewRelays`).
 */
export async function publishTargets(options: PublishOwnOptions = {}): Promise<string[]> {
  const intercept = cacheRelay.interceptUrl;
  if (!intercept) return await auth.getWriteRelays();
  if (!options.writeRelays) return [intercept];
  return [...new Set([intercept, ...(await auth.getWriteRelays())])];
}

/**
 * Sign an event and write it, answering whether a relay took it.
 *
 * Through the cache relay the `OK` means stored and handed on, not accepted
 * upstream — the relay forwards fire-and-forget. That is the write-through
 * bargain the read path already makes.
 *
 * Rejections are logged here because the reason is the same kind of detail
 * whatever was published; what to tell the user about it is the caller's, which
 * is the one that knows whether it was a repost or a reaction.
 */
export async function signAndPublish(
  event: UnsignedEvent,
  options: PublishOwnOptions = {}
): Promise<boolean> {
  // Before signing, so the consent dialog is the last thing between the press
  // and the publish rather than a network round trip after it.
  const relays = await publishTargets(options);
  const signed = await auth.signEvent(event);
  // Optional in the signer's type because it takes unsigned events too.
  if (!signed.id) throw new Error('signed event has no id');
  // The account can be switched at nosskey.app between building an event and
  // signing it (`reconcileSession` notices only on the next visibility change),
  // and the signer uses whichever it now holds. Publishing that would put one
  // account's content out under another's name — for a contact list, it would
  // replace the follows of an account that never asked for it.
  if (signed.pubkey !== event.pubkey) {
    throw new Error('signed by a different account than the event was built for');
  }
  const result = await publishEvent({ ...signed, id: signed.id }, relays);
  if (result.accepted.length === 0) {
    console.error('[combine] kind', event.kind, 'rejected by every relay:', result.rejected);
    return false;
  }
  return true;
}
