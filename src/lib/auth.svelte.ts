import { NosskeyIframeClient, NosskeyIframeError, type NostrEvent } from 'nosskey-iframe';

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

  #client: NosskeyIframeClient | null = null;
  #observer: MutationObserver | null = null;

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
    return client;
  }

  async login(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.error = null;
    this.needsOnboarding = false;
    try {
      const client = this.#getClient();
      await client.ready();
      const pubkey = await client.getPublicKey();
      this.pubkey = pubkey;
      localStorage.setItem(STORAGE_KEY, pubkey);
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
    localStorage.removeItem(STORAGE_KEY);
  }

  /** Sign an event via the Nosskey iframe (shows its consent dialog). */
  async signEvent(event: NostrEvent): Promise<NostrEvent> {
    const client = this.#getClient();
    await client.ready();
    return client.signEvent(event);
  }
}

export const auth = new AuthStore();
