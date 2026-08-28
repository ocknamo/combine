<script lang="ts">
/**
 * What every nostr-cache element in the app has to wait for, and what the user
 * sees until then.
 *
 * Two waits, and they are one thing to get right rather than one per view:
 *
 * - the bundle that defines the elements (`loadNostrTimeline`). Mounting one
 *   before it lands leaves an element the browser never upgrades.
 * - the page's cache relay. A widget mounted before the relay set has settled
 *   restarts when it does, losing the events on screen — and an element that
 *   acquires the relay itself would configure it, so the app's own acquisition
 *   has to be the page's first (see `cacheRelay.svelte.ts`).
 *
 * A failed load is reported as a nostr-cache connection problem because that is
 * what it is: the bundle is served from its GitHub Pages deploy, so the link is
 * both the diagnosis and somewhere to check.
 */
import { onMount, type Snippet } from 'svelte';
import { cacheRelay } from '../cacheRelay.svelte';
import { loadNostrTimeline, NOSTR_CACHE_ORIGIN, NOSTR_CACHE_PATH } from '../nostrCache';

let { children }: { children: Snippet } = $props();

let ready = $state(false);
let failed = $state(false);

// The load is shared and memoised, so several gates on one page inject one
// script and all resolve off the same promise.
onMount(() => {
  loadNostrTimeline().then(
    () => {
      ready = true;
    },
    () => {
      failed = true;
    }
  );
});
</script>

{#if failed}
  <p class="empty">
    読み込めませんでした。
    <a href={`${NOSTR_CACHE_ORIGIN}${NOSTR_CACHE_PATH}`} target="_blank" rel="noreferrer">
      nostr-cache
    </a>
    に接続できない可能性があります。
  </p>
{:else if !ready || !cacheRelay.resolved}
  <p class="empty">読み込み中…</p>
{:else}
  {@render children()}
{/if}
