<script lang="ts">
/**
 * A list of events rendered by nostr-cache's `<nostr-timeline>`, chosen with a
 * NIP-01 filter.
 *
 * The same widget the home timeline uses, so notifications, a profile's posts
 * and search results render exactly like the follow feed — and read through the
 * same in-page relay and IndexedDB rather than talking to the upstream relays
 * on their own.
 *
 * The element takes its upstream relays and cache settings directly (it
 * acquires the page's relay host itself), so unlike the Nostr Web Components
 * this does not wait on `cacheRelay`. `db-name` and `profile-freshness` must
 * match what every other holder passes — whoever gets there first configures
 * the relay, and a mismatch is ignored with a console warning.
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
  // Shared, deduplicated promise: a mount after the first resolves immediately.
  loadNostrTimeline().then(
    () => {
      ready = true;
    },
    () => {
      failed = true;
    }
  );
});

// The widget parses a comma-separated string, unlike nostr-web-components.
const relays = $derived(relaysAttr(auth.relays));

// Plain props, not part of a {#key}: the element re-runs its subscription when
// `filters` or `relays` change, so a new search term or a relay switch does not
// need it rebuilt (`nostr-list` did).
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
