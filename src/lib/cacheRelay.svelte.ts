import { type CacheRelayHandle, startCacheRelay } from './nostrCache';
import { DEFAULT_RELAYS, pickViewRelays } from './relays';

/**
 * Whether the page's cache relay is up, and what the views should connect to
 * as a result.
 *
 * `idle` is not "no cache" — it is "we do not know yet". Views wait for it to
 * resolve before mounting a Nostr element: `nostr-list@0.3.0` never adopts a
 * changed `relays` prop, and the nostr-cache widgets adopt one by restarting
 * (see {@link CacheRelayStore.upstreamRelays}). Waiting also makes the app's
 * acquisition the page's first, so it is `dbName` and `profileFreshness` here
 * that configure the relay.
 */
type Status = 'idle' | 'ready' | 'unavailable';

class CacheRelayStore {
  status = $state<Status>('idle');
  /** The running relay's URL, or `null` when there is none to read through. */
  interceptUrl = $state<string | null>(null);

  /**
   * Upstream relays the running relay was started with.
   *
   * Views read this rather than `auth.relays`, which is replaced seconds into
   * the session once the signing iframe answers: a nostr-cache widget restarts
   * on a changed `relays` attribute and loses the events on screen. This moves
   * only when the relay is rebuilt for the new set anyway.
   */
  upstreamRelays = $state<string[]>(DEFAULT_RELAYS);

  #handle: CacheRelayHandle | null = null;
  #starting: Promise<void> | null = null;
  /**
   * Bumped by every {@link stop}, so an attempt that was in flight at the time
   * knows its result is stale and releases it instead of publishing it.
   */
  #generation = 0;

  /** Whether the answer is in — either way. Views render once this is true. */
  get resolved(): boolean {
    return this.status !== 'idle';
  }

  /** What to hand a Nostr Web Component's `relays` property. */
  get viewRelays(): string[] {
    return pickViewRelays(this.interceptUrl, this.upstreamRelays);
  }

  /**
   * Boot the relay and hold an acquisition for as long as the app runs.
   *
   * Concurrent callers share the one attempt. A failure is a final answer
   * rather than something to retry: {@link startCacheRelay} already reports
   * every way this can go wrong as "no cache", and the views behind
   * {@link resolved} are waiting on it.
   */
  start(relays: string[]): Promise<void> {
    if (this.#starting) return this.#starting;
    // Before the first await, so `resolved` never turns true next to the relays
    // of the previous run.
    this.upstreamRelays = relays;
    const generation = this.#generation;
    this.#starting = startCacheRelay(relays).then(async (handle) => {
      if (generation !== this.#generation) {
        // A stop() landed while this was in flight. Publishing the handle now
        // would leave the app holding a relay it asked to let go of.
        await handle?.release();
        return;
      }
      this.#handle = handle;
      this.interceptUrl = handle?.interceptUrl ?? null;
      this.status = handle ? 'ready' : 'unavailable';
    });
    return this.#starting;
  }

  /**
   * Release this app's acquisition and go back to `idle`.
   *
   * {@link upstreamRelays} keeps the old set until the next {@link start}
   * replaces it — nothing reads it while the status is `idle`.
   *
   * Used when the relay set changes (login, logout): the running relay keeps
   * the upstreams it was started with, so reading from the new ones means
   * standing it back up. `acquireRelayHost` waits for a host that is still
   * shutting down before starting its replacement, so a `stop()` immediately
   * followed by a `start()` is safe.
   */
  async stop(): Promise<void> {
    const handle = this.#handle;
    this.#generation += 1;
    this.#handle = null;
    this.#starting = null;
    this.interceptUrl = null;
    this.status = 'idle';
    await handle?.release();
  }
}

export const cacheRelay = new CacheRelayStore();
