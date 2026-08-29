<script lang="ts">
/**
 * The two waits every nostr-cache element needs before it is mounted:
 *
 * - the bundle, or the browser never upgrades the element;
 * - the cache relay, or the element restarts when the relay set settles and
 *   loses the events on screen — and, acquiring the relay itself, it would be
 *   the one configuring it (see `cacheRelay.svelte.ts`).
 */
import { onMount, type Snippet } from 'svelte';
import { cacheRelay } from '../cacheRelay.svelte';
import { loadNostrTimeline, NOSTR_CACHE_ORIGIN, NOSTR_CACHE_PATH } from '../nostrCache';

let { children }: { children: Snippet } = $props();

let ready = $state(false);
let failed = $state(false);

// Memoised: several gates on a page share one script and one promise.
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
