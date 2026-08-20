<script lang="ts">
/**
 * Events chosen with a NIP-01 filter, rendered by the same nostr-cache widget
 * as the home timeline so every list in the app looks and behaves alike. Not a
 * caching concern: these views read through the in-page relay either way (see
 * `cacheRelay.svelte.ts`).
 *
 * `db-name` and `profile-freshness` have to agree with every other holder of
 * that relay — the first acquisition configures it and a mismatch is only a
 * console warning. The element acquires it itself, so it takes the *upstream*
 * relays rather than the intercept URL, and it re-subscribes on a changed
 * `filters` or `relays`, so no view needs a {#key} around it.
 *
 * It still waits for `cacheRelay`, for the relays rather than the URL: they are
 * only settled once the relay has been started with them, and re-subscribing
 * costs the events on screen — see `cacheRelay.svelte.ts`.
 *
 * `actions` is the same story: it puts the 詳細 button under every row, which is
 * how notifications, a profile's posts and hashtag results reach the detail
 * page. `author-action` does the same for each card's avatar and display name,
 * which is how they reach a person's page. Both arrive as
 * `nostr-timeline:action`, which `navigateOnAction` turns into navigation.
 */
import { onMount } from 'svelte';
import { cacheRelay } from '../cacheRelay.svelte';
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
import { navigateOnAction } from '../postAction';
import { AUTHOR_ACTION_ID, MATERIAL_ICONS, POST_ACTIONS_ATTR } from '../postRef';

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

const relays = $derived(relaysAttr(cacheRelay.upstreamRelays));
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
{:else if !ready || !cacheRelay.resolved}
  <p class="empty">読み込み中…</p>
{:else}
  <nostr-timeline
    use:navigateOnAction
    filters={filtersJson}
    {relays}
    actions={POST_ACTIONS_ATTR}
    author-action={AUTHOR_ACTION_ID}
    material-icons={MATERIAL_ICONS}
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
