/**
 * Loader for the nostr-cache timeline widget.
 *
 * nostr-cache runs a Nostr relay inside the browser and puts it in front of the
 * upstream relays as a transparent cache, so a second visit renders from
 * IndexedDB instead of waiting for a round trip. It ships the timeline as two
 * custom elements, `<nostr-timeline>` and `<nostr-follow-timeline>`.
 *
 * The package (`@nostr-cache/timeline-embed`) is private to the nostr-cache
 * monorepo and is not on npm, so the only way to get the elements is the
 * self-contained IIFE its GitHub Pages deploy serves. Both elements are defined
 * by that one file.
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
 * Format a relay list for the widget's `relays` attribute.
 *
 * Note this is the opposite of what Nostr Web Components wants (see
 * `relays.ts`): the nostr-cache elements parse a comma-separated *string* and
 * would read an array as its stringified form.
 */
export function relaysAttr(relays: string[]): string {
  return relays.join(',');
}

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
