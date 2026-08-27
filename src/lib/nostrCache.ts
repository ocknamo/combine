/**
 * Loader for nostr-cache: the timeline widget, and the in-page cache relay
 * behind it.
 *
 * nostr-cache runs a Nostr relay inside the browser and puts it in front of the
 * upstream relays as a transparent cache, so a second visit renders from
 * IndexedDB instead of waiting for a round trip. It ships the timeline as two
 * custom elements, `<nostr-timeline>` and `<nostr-follow-timeline>`.
 *
 * The package (`@nostr-cache/timeline-embed`) is private to the nostr-cache
 * monorepo and is not on npm, so the only way to get any of it is the
 * self-contained IIFE its GitHub Pages deploy serves. Both elements are defined
 * by that one file.
 *
 * The relay is not only for the timeline. It works by swapping
 * `globalThis.WebSocket` and intercepting connections to one URL, which means
 * *any* client on the page that dials that URL reads through the same cache —
 * including the Nostr Web Components the other views use, which talk to relays
 * through rx-nostr just like the widget does. {@link startCacheRelay} boots the
 * relay for the whole app so those views can point at it; see
 * `cacheRelay.svelte.ts`.
 */

export const NOSTR_CACHE_ORIGIN = 'https://ocknamo.github.io';
export const NOSTR_CACHE_PATH = '/nostr-cache/';
export const NOSTR_CACHE_SCRIPT_URL = `${NOSTR_CACHE_ORIGIN}${NOSTR_CACHE_PATH}nostr-timeline.js`;

/**
 * IndexedDB database the in-page relay caches into.
 *
 * Deliberately not the widget's default (`nostr-cache-embed`): in production
 * combine and the nostr-cache demo site are both served from
 * `ocknamo.github.io`, so the default name would have them share one database.
 */
export const NOSTR_CACHE_DB_NAME = 'combine-timeline';

/**
 * Seconds a cached profile (kind 0) is served before the relay re-asks upstream.
 *
 * An hour rather than the widget's own default of a day: combine shows the
 * signed-in user their own avatar and display name in the header, and someone
 * who has just edited their profile elsewhere should not have to wait until
 * tomorrow to see it. Still long enough that the common case — several views
 * rendering the same handful of authors — costs one upstream REQ, not one per
 * view per visit.
 *
 * The page runs a single relay and the first acquisition configures it, so this
 * value has to reach every widget too: `HomeView` passes it as
 * `profile-freshness`. If the two disagree, nostr-cache keeps the first and
 * warns.
 */
export const NOSTR_CACHE_PROFILE_FRESHNESS = 3600;

/**
 * Format a relay list for the widget's `relays` attribute.
 *
 * Note this is the opposite of what Nostr Web Components wants (see
 * `relays.ts`): the nostr-cache elements parse a comma-separated *string* and
 * would read an array as its stringified form.
 */
export function relaysAttr(relays: string[]): string {
  return relays.join(',');
}

/**
 * A NIP-01 filter, narrowed to the keys nostr-cache understands. It drops an
 * unsupported one with a warning — which widens the query rather than narrowing
 * it.
 */
export type NostrFilter = {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
} & { [tag: `#${string}`]: string[] };

/**
 * Format filters for the widget's `filters` attribute. They replace the
 * element's `kinds` / `authors` / `limit`, which it then ignores with a
 * warning, and only the first 10 are read.
 */
export function filtersAttr(filters: NostrFilter[]): string {
  return JSON.stringify(filters);
}

/**
 * The `ogp-proxy` attribute value, or `undefined` when there is nothing to pass.
 *
 * The widgets build link cards by fetching the linked page through a CORS proxy
 * and reading its Open Graph tags — a browser cannot read another site's HTML
 * itself. There is no sensible default: the proxy is `workers/ogp` in this
 * repository, which every deployment runs (and pays for) as its own, so an
 * unconfigured build simply leaves links as links rather than borrowing
 * someone else's. Svelte drops an attribute set to `undefined`, which is how
 * "not configured" reaches the widgets: a present attribute that is not a URL
 * is refused there anyway, so there is no point sending one.
 */
export function ogpProxyAttr(raw: string | undefined): string | undefined {
  const proxy = raw?.trim();
  return proxy ? proxy : undefined;
}

/** Set at build time: `VITE_OGP_PROXY=https://…/ogp npm run build`. */
export const OGP_PROXY = ogpProxyAttr(import.meta.env.VITE_OGP_PROXY);

let pending: Promise<void> | null = null;

/**
 * Inject the widget bundle once and resolve when the custom elements are
 * defined. Concurrent callers share the same promise; a failed load is not
 * cached, so a later call can retry.
 */
export function loadNostrTimeline(): Promise<void> {
  if (pending) return pending;

  pending = new Promise<void>((resolve, reject) => {
    // Already defined (e.g. a previous mount loaded it before a hot reload).
    if (customElements.get('nostr-timeline')) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = NOSTR_CACHE_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error(`Failed to load ${NOSTR_CACHE_SCRIPT_URL}`));
    };
    document.head.appendChild(script);
  });

  pending.catch(() => {
    pending = null;
  });

  return pending;
}

/**
 * The bundle's in-page relay, once acquired.
 *
 * Only the parts combine uses. `interceptUrl` is the URL the relay answers on —
 * read from the host rather than hardcoded, so the value stays nostr-cache's to
 * choose.
 */
export interface CacheRelayHandle {
  interceptUrl: string;
  release(): Promise<void>;
}

interface RelayHostConfig {
  upstreamRelays?: string[];
  dbName?: string;
  profileFreshness?: number;
}

/**
 * The globals the widget bundle defines.
 *
 * `acquireRelayHost` is optional because the deployed bundle may predate it
 * (see ocknamo/nostr-cache#67): every consumer has to cope with it being
 * missing until that ships.
 */
interface NostrTimelineEmbedGlobal {
  acquireRelayHost?: (config: RelayHostConfig) => Promise<CacheRelayHandle>;
}

/**
 * Start — or join — the page's cache relay, so every view can read through it.
 *
 * Holding an acquisition for the app's lifetime is the point: the relay is
 * reference counted and shuts down when the last holder releases, so without
 * one it would only be alive while a timeline widget happened to be mounted,
 * and navigating away from Home would take the cache down with it.
 *
 * @param relays Upstream relays to read through to. Honoured only if this is
 *   the page's first acquisition — a mounted widget would already have
 *   configured the relay.
 * @returns The handle, or `null` when the cache is simply not available: the
 *   bundle failed to load, it predates the relay API, or the relay could not
 *   start (private browsing with no IndexedDB, say). All three are the same
 *   thing to a caller — read from the upstream relays directly instead — and
 *   none of them is worth breaking a view over.
 */
export async function startCacheRelay(relays: string[]): Promise<CacheRelayHandle | null> {
  try {
    await loadNostrTimeline();
    const embed = (globalThis as { NostrTimelineEmbed?: NostrTimelineEmbedGlobal })
      .NostrTimelineEmbed;
    if (!embed?.acquireRelayHost) return null;
    return await embed.acquireRelayHost({
      upstreamRelays: relays,
      dbName: NOSTR_CACHE_DB_NAME,
      profileFreshness: NOSTR_CACHE_PROFILE_FRESHNESS,
    });
  } catch {
    return null;
  }
}
