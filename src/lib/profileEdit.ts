/**
 * Reading the base a profile edit is built on, and judging whether it is safe
 * to build on. The arithmetic is `profileMeta.ts`; the screen is
 * `ProfileEditView.svelte`.
 */
import { auth } from './auth.svelte';
import {
  asProfileEvent,
  type ProfileEvent,
  parseProfileContent,
  pickLatestProfile,
} from './profileMeta';
import { fetchReplaceable, type ReplaceableKind } from './replaceableFetch';

const PROFILE: ReplaceableKind<ProfileEvent> = {
  kind: 0,
  parse: asProfileEvent,
  pickLatest: pickLatestProfile,
};

/**
 * Relays that must agree there is no profile before offering to write a fresh
 * one — the same bar `follows.svelte.ts` sets for a contact list, for the same
 * reason: a NIP-42 relay answers EOSE with nothing.
 */
const NEW_PROFILE_QUORUM = 2;

export interface ProfileBase {
  base: ProfileEvent | null;
  answered: number;
  asked: number;
}

/**
 * - `ready`: a profile to edit.
 * - `new`: enough relays agree there is none; the form starts empty.
 * - `unavailable`: too few relays answered to tell, so nothing may be written.
 * - `unreadable`: the profile's content is not a JSON object; writing over it
 *   would drop whatever it holds.
 */
export type BaseVerdict = 'ready' | 'new' | 'unavailable' | 'unreadable';

export function judgeBase({ base, answered, asked }: ProfileBase): BaseVerdict {
  if (answered === 0) return 'unavailable';
  if (base) return parseProfileContent(base.content) ? 'ready' : 'unreadable';
  return answered >= Math.min(NEW_PROFILE_QUORUM, asked) ? 'new' : 'unavailable';
}

/**
 * What this app last published, per account. Relays take a moment to serve back
 * what they were just given, and a second save inside that window would build
 * on a base predating the first and revert it.
 */
const published = new Map<string, ProfileEvent>();

export function rememberPublished(event: ProfileEvent): void {
  published.set(event.pubkey, event);
}

/** How long the write relays may take: the Nosskey iframe answers them, and can hang. */
const WRITE_RELAYS_TIMEOUT_MS = 5000;

/** `promise`, or `fallback` once `ms` have passed without it settling. */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

/**
 * Read and write relays both: clients publish a profile to the write relays, so
 * reading only the read set could miss the newest copy. Without an answer about
 * the write set, the read set alone beats a screen that never loads.
 */
async function profileRelays(): Promise<string[]> {
  const write = await withTimeout(auth.getWriteRelays(), WRITE_RELAYS_TIMEOUT_MS, []);
  return [...new Set([...auth.relays, ...write])];
}

/** The newest profile the relays — or this app — know of. Never rejects. */
export async function fetchProfileBase(pubkey: string): Promise<ProfileBase> {
  const relays = await profileRelays();
  const result = await fetchReplaceable(PROFILE, pubkey, relays);
  const base = pickLatestProfile([result.event, published.get(pubkey) ?? null]);
  return { base, answered: result.answered.length, asked: relays.length };
}
