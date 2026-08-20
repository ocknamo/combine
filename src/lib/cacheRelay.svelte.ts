import { type CacheRelayHandle, startCacheRelay } from './nostrCache';
import { DEFAULT_RELAYS, pickViewRelays } from './relays';

/**
 * Whether the page's cache relay is up, and what the views should connect to
 * as a result.
 *
 * `idle` is not "no cache" — it is "we do not know yet". Views wait for it to
 * resolve before mounting a Nostr element, for two reasons:
 *
 *  - `nostr-list@0.3.0` does not react to a changed `relays` prop, so an
 *    element mounted against the upstream relays would stay on them for its
 *    whole life, even after the relay came up a moment later.
 *  - the nostr-cache widgets do react, and restart when they see one — see
 *    {@link CacheRelayStore.upstreamRelays}. Waiting also makes the app's own
 *    acquisition the page's first, so its `dbName` and `profileFreshness`
 *    configure the relay and a widget mounting later can only agree with it.
 */
type Status = 'idle' | 'ready' | 'unavailable';

class CacheRelayStore {
  status = $state<Status>('idle');
  /** The running relay's URL, or `null` when there is none to read through. */
  interceptUrl = $state<string | null>(null);

  /**
   * Upstream relays the relay is running with: the set handed to the current
   * {@link start}, not whatever `auth.relays` holds right now.
   *
   * Views pass this to the nostr-cache widgets instead of reading `auth`
   * directly. A widget re-subscribes whenever its `relays` attribute changes,
   * and doing so releases and re-acquires the page relay — so a widget reading
   * `auth.relays` live restarts a few seconds into every session, when the
   * user's relays arrive from the signing iframe and replace the defaults, and
   * the events already on screen are thrown away. This moves only when the
   * relay is restarted for a new set anyway, so a view that waits for
   * {@link resolved} sees exactly one value per relay set.
   *
   * Starts at {@link DEFAULT_RELAYS} — where `auth.relays` starts too — and is
   * only read while the relay is up, so it is never the empty list.
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
    // Before the first await, so the relays a view reads are already the new
    // ones by the time `status` says the relay is up.
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
   * {@link upstreamRelays} deliberately keeps the old set until the next
   * {@link start} replaces it: nothing renders a Nostr element while the status
   * is `idle`, and emptying it would only give a stray reader a relay list that
   * cannot reach anything.
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
