/**
 * NIP-01 verification of an event a relay handed over.
 *
 * A relay can answer with anything, and what `replaceableFetch.ts` reads becomes
 * the base of an event the user signs — so an unverified one lets a single relay
 * rewrite a contact list or a profile under the user's own signature.
 */
import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

/**
 * How far ahead of this device's clock an event may be dated.
 *
 * `nextCreatedAt` steps past the base, so a far-future base would be published
 * as a far-future event that no ordinary update could ever replace.
 */
export const MAX_FUTURE_SECONDS = 600;

const HEX_64 = /^[0-9a-f]{64}$/;
const HEX_128 = /^[0-9a-f]{128}$/;

/** `id` is the hash of the content, and `sig` is the author's signature of it. */
export function verifyEvent(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const { id, sig, pubkey, created_at, kind, tags, content } = value as Record<string, unknown>;
  if (typeof id !== 'string' || !HEX_64.test(id)) return false;
  if (typeof sig !== 'string' || !HEX_128.test(sig)) return false;
  if (typeof pubkey !== 'string' || !HEX_64.test(pubkey)) return false;
  if (typeof created_at !== 'number' || !Number.isSafeInteger(created_at)) return false;
  if (typeof kind !== 'number' || !Number.isSafeInteger(kind)) return false;
  if (typeof content !== 'string' || !Array.isArray(tags)) return false;

  try {
    const serialized = JSON.stringify([0, pubkey, created_at, kind, tags, content]);
    if (bytesToHex(sha256(new TextEncoder().encode(serialized))) !== id) return false;
    return schnorr.verify(hexToBytes(sig), hexToBytes(id), hexToBytes(pubkey));
  } catch {
    return false;
  }
}

/** A verified event that is not dated further ahead than {@link MAX_FUTURE_SECONDS}. */
export function isTrustworthyEvent(
  value: unknown,
  now: number = Math.floor(Date.now() / 1000)
): boolean {
  if (!verifyEvent(value)) return false;
  return (value as { created_at: number }).created_at <= now + MAX_FUTURE_SECONDS;
}
