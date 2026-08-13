<script lang="ts">
/**
 * Events chosen with a NIP-01 filter, rendered by the same nostr-cache widget
 * as the home timeline so every list in the app looks and behaves alike. Not a
 * caching concern: these views read through the in-page relay either way (see
 * `cacheRelay.svelte.ts`).
 *
 * `db-name` and `profile-freshness` have to agree with every other holder of
 * that relay — the first acquisition configures it and a mismatch is only a
 * console warning. The element acquires it itself, so nothing here waits on
 * `cacheRelay`, and it re-subscribes on a changed `filters` or `relays`, so no
 * view needs a {#key} around it.
 */
import { onMount } from 'svelte';
import { auth } from '../auth.svelte';
import {
  filtersAttr,
  loadNostrTimeline,
  NOSTR_CACHE_DB_NAME,
  NOSTR_CACHE_ORIGIN,
  NOSTR_CACHE_PATH,
  NOSTR_CACHE_PROFILE_FRESHNESS,
  type NostrFilter,
  relaysAttr,
} from '../nostrCache';

let { filters }: { filters: NostrFilter[] } = $props();

let ready = $state(false);
let failed = $state(false);

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

const relays = $derived(relaysAttr(auth.relays));
const filtersJson = $derived(filtersAttr(filters));
</script>

{#if failed}
  <p class="empty">
    読み込めませんでした。
    <a href={`${NOSTR_CACHE_ORIGIN}${NOSTR_CACHE_PATH}`} target="_blank" rel="noreferrer">
      nostr-cache
    </a>
    に接続できない可能性があります。
  </p>
{:else if !ready}
  <p class="empty">読み込み中…</p>
{:else}
  <nostr-timeline
    filters={filtersJson}
    {relays}
    db-name={NOSTR_CACHE_DB_NAME}
    profile-freshness={String(NOSTR_CACHE_PROFILE_FRESHNESS)}
  ></nostr-timeline>
{/if}

<style>
  .empty {
    text-align: center;
    color: var(--text-muted);
    padding: 2rem 1rem;
  }
</style>
