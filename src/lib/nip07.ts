/**
 * `window.nostr` shim over the Nosskey signing iframe.
 *
 * nosskey-iframe is built to be published this way: its client is a NIP-07
 * shaped façade the parent page assigns to `window.nostr` (see the package
 * README). combine needs that assignment because this is the only way an embed
 * sharing the page can reach a signer — it looks for a NIP-07 provider in its
 * own realm. The eHagaki composer is one: it signs through here and nothing
 * else (see `ehagakiComposer.ts`).
 *
 * The private key still never enters this realm. Every call crosses into
 * nosskey.app, which gates the sensitive ones behind its own consent dialog.
 */

import type { NostrEvent, RelayMap } from 'nosskey-iframe';
import { auth } from './auth.svelte';

/**
 * The NIP-07 surface combine publishes.
 *
 * Deliberately three methods, not the seven nosskey-iframe can forward: combine
 * has no DM feature, and `nip04` / `nip44` on a page-global would let any embed
 * ask the user to decrypt their messages for no gain here. Callers feature-detect
 * those, so leaving them off degrades cleanly.
 */
export interface Nip07Provider {
  getPublicKey(): Promise<string>;
  signEvent(event: NostrEvent): Promise<NostrEvent>;
  getRelays(): Promise<RelayMap>;
}

/** What the provider needs from the app. Injected so it can be tested. */
export interface Nip07Source {
  /** The session's pubkey, or `null` while signed out. */
  getPubkey(): string | null;
  /** Run combine's login flow. Resolves whether or not it signed in. */
  login(): Promise<void>;
  signEvent(event: NostrEvent): Promise<NostrEvent>;
  getRelays(): Promise<RelayMap>;
  /** Whether a user gesture is still in effect — see {@link createNip07Provider}. */
  hasUserActivation(): boolean;
}

declare global {
  interface Window {
    nostr?: Nip07Provider;
  }
}

export function createNip07Provider(source: Nip07Source): Nip07Provider {
  return {
    async getPublicKey(): Promise<string> {
      // Answer from the session rather than the iframe: a caller that restores
      // its own session asks for this on load, and sending that through
      // nosskey.app would risk a passkey prompt nobody asked for.
      const known = source.getPubkey();
      if (known) return known;

      // Signed out, so this can only be answered by logging in — which shows a
      // passkey dialog, and must therefore follow a tap. An embed's own login
      // button qualifies; a silent session restore or `auto-login` does not.
      if (!source.hasUserActivation()) {
        throw new Error('combine is not logged in');
      }
      await source.login();
      const pubkey = source.getPubkey();
      if (!pubkey) throw new Error('combine login did not complete');
      return pubkey;
    },
    signEvent: (event) => source.signEvent(event),
    getRelays: () => source.getRelays(),
  };
}

/** The live source: combine's auth store and the browser's activation state. */
export const authNip07Source: Nip07Source = {
  getPubkey: () => auth.pubkey,
  login: () => auth.login(),
  signEvent: (event) => auth.signEvent(event),
  getRelays: () => auth.getRelayMap(),
  hasUserActivation: () =>
    // Undefined in browsers without the API: treat that as "no gesture" so the
    // fallback is a rejected request rather than an unexpected passkey prompt.
    typeof navigator !== 'undefined' && navigator.userActivation?.isActive === true,
};

/**
 * Publish the provider on `target` (the page's `window`).
 *
 * An extension's provider is replaced on purpose: combine's session decides who
 * is posting, and letting an embed sign as some other key would put a post under
 * a pubkey the rest of the app is not showing. Returns a function that puts back
 * whatever was there.
 */
export function installNip07(
  target: { nostr?: Nip07Provider } = window,
  source: Nip07Source = authNip07Source
): () => void {
  const previous = target.nostr;
  target.nostr = createNip07Provider(source);
  return () => {
    if (previous) target.nostr = previous;
    else delete target.nostr;
  };
}
