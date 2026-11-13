import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';

const TEST_SECRET_KEY = new Uint8Array(32).fill(7);
export const TEST_PUBKEY = bytesToHex(schnorr.getPublicKey(TEST_SECRET_KEY));

export interface SignedTestEvent {
  id: string;
  sig: string;
  pubkey: string;
  kind: number;
  created_at: number;
  content: string;
  tags: string[][];
}

/** A genuinely signed event, so tests exercise the real verifier. */
export function signTestEvent(
  draft: Pick<SignedTestEvent, 'kind' | 'created_at' | 'content' | 'tags'>
): SignedTestEvent {
  const { kind, created_at, content, tags } = draft;
  const hash = sha256(
    new TextEncoder().encode(JSON.stringify([0, TEST_PUBKEY, created_at, kind, tags, content]))
  );
  return {
    id: bytesToHex(hash),
    sig: bytesToHex(schnorr.sign(hash, TEST_SECRET_KEY)),
    pubkey: TEST_PUBKEY,
    kind,
    created_at,
    content,
    tags,
  };
}
