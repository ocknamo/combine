import { NosskeyIframeClient, NosskeyIframeError, type NostrEvent } from 'nosskey-iframe';
import { DEFAULT_RELAYS, readRelaysFrom } from './relays';

const NOSSKEY_IFRAME_URL = 'https://nosskey.app/#/iframe';
const STORAGE_KEY = 'combine:pubkey';

function storedPubkey(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY);
}

/**
 * Login state backed by the Nosskey signing iframe (passkey based NIP-07).
 *
 * The iframe is mounted once into a fixed overlay; nosskey-iframe toggles the
 * iframe's own visibility when user consent is needed, and a MutationObserver
 * mirrors that onto the overlay backdrop.
 */
class AuthStore {
  pubkey = $state<string | null>(storedPubkey());
  busy = $state(false);
  error = $state<string | null>(null);
  /** True when the user has no passkey yet and must onboard at nosskey.app. */
  needsOnboarding = $state(false);
  /**
   * Relays the views should read from. Starts at {@link DEFAULT_RELAYS} and is
   * replaced with the signed-in user's relays (NIP-07 `getRelays()`) on login.
   */
  relays = $state<string[]>(DEFAULT_RELAYS);

  #client: NosskeyIframeClient | null = null;
  #observer: MutationObserver | null = null;
  #overlay: HTMLElement | null = null;
  #reconciling = false;

  constructor() {
    // Re-check the signing session whenever the user returns to this tab, so an
    // account switch (or logout) performed at nosskey.app is reflected here
    // without a full page reload. See {@link reconcileSession}.
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.#onVisibilityChange);
    }
  }

  get loggedIn(): boolean {
    return this.pubkey !== null;
  }

  #getClient(): NosskeyIframeClient {
    if (this.#client) return this.#client;
    const overlay = document.createElement('div');
    overlay.className = 'nosskey-overlay';
    document.body.appendChild(overlay);
    const client = new NosskeyIframeClient({
      iframeUrl: NOSSKEY_IFRAME_URL,
      container: overlay,
      theme: 'neutral-light',
      lang: 'auto',
    });
    this.#observer = new MutationObserver(() => {
      overlay.classList.toggle('visible', client.iframe.style.display !== 'none');
    });
    this.#observer.observe(client.iframe, { attributes: true, attributeFilter: ['style'] });
    this.#client = client;
    this.#overlay = overlay;
    return client;
  }

  /**
   * Tear down the signing iframe and its overlay. The iframe caches the active
   * account in memory for its whole lifetime, so a fresh one must be mounted to
   * observe an account that was switched at nosskey.app. No-op when none exists.
   */
  #destroyClient(): void {
    this.#observer?.disconnect();
    this.#observer = null;
    this.#client?.destroy();
    this.#client = null;
    this.#overlay?.remove();
    this.#overlay = null;
  }

  async login(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.error = null;
    this.needsOnboarding = false;
    try {
      // Start from a fresh iframe so a switch made at nosskey.app is picked up
      // without a page reload (the previous iframe holds the old account).
      this.#destroyClient();
      const client = this.#getClient();
      await client.ready();
      const pubkey = await client.getPublicKey();
      this.pubkey = pubkey;
      localStorage.setItem(STORAGE_KEY, pubkey);
      // Relay discovery is best-effort and must not block the login result.
      void this.refreshRelays();
    } catch (err) {
      if (err instanceof NosskeyIframeError && err.code === 'NO_KEY') {
        this.needsOnboarding = true;
        this.error = 'パスキーが見つかりません。nosskey.app でパスキーを作成してください。';
      } else if (err instanceof NosskeyIframeError && err.code === 'USER_REJECTED') {
        this.error = 'リクエストが拒否されました。';
      } else {
        this.error = err instanceof Error ? err.message : String(err);
      }
    } finally {
      this.busy = false;
    }
  }

  logout(): void {
    this.pubkey = null;
    this.error = null;
    this.needsOnboarding = false;
    this.relays = DEFAULT_RELAYS;
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * Load the signed-in user's relays from the Nosskey iframe (`getRelays()`).
   * Best-effort: keeps the current relays on failure and never prompts the
   * user. Safe to call on startup for a restored session.
   */
  async refreshRelays(): Promise<void> {
    if (!this.pubkey) return;
    try {
      const client = this.#getClient();
      await client.ready();
      this.relays = readRelaysFrom(await client.getRelays());
    } catch {
      // Relay discovery is best-effort; keep whatever relays we already have.
    }
  }

  #onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') void this.reconcileSession();
  };

  /**
   * Re-check which account nosskey.app is signed in as and reconcile it with the
   * local session. Mounts a fresh iframe (the live one caches the account for
   * its lifetime) and:
   *  - adopts the new pubkey if the account was switched elsewhere,
   *  - logs out if nosskey.app reports no key (signed out elsewhere).
   *
   * Best-effort and silent: transient errors keep the current session, and it
   * does nothing while signed out (a fresh {@link login} handles that case).
   */
  async reconcileSession(): Promise<void> {
    if (!this.loggedIn || this.busy || this.#reconciling) return;
    this.#reconciling = true;
    try {
      this.#destroyClient();
      const client = this.#getClient();
      await client.ready();
      const pubkey = await client.getPublicKey();
      if (pubkey !== this.pubkey) {
        this.pubkey = pubkey;
        localStorage.setItem(STORAGE_KEY, pubkey);
        this.error = null;
        this.needsOnboarding = false;
        void this.refreshRelays();
      }
    } catch (err) {
      // NO_KEY means the user signed out at nosskey.app; drop our session too.
      // Other errors (timeout, network) are transient — keep what we have.
      if (err instanceof NosskeyIframeError && err.code === 'NO_KEY') {
        this.logout();
      }
    } finally {
      this.#reconciling = false;
    }
  }

  /** Sign an event via the Nosskey iframe (shows its consent dialog). */
  async signEvent(event: NostrEvent): Promise<NostrEvent> {
    const client = this.#getClient();
    await client.ready();
    return client.signEvent(event);
  }
}

export const auth = new AuthStore();
