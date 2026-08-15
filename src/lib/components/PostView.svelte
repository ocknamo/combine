<script lang="ts">
/**
 * One post, as the subject of the page rather than a row in a list.
 *
 * `<nostr-post>` is the third element in the nostr-cache bundle the timelines
 * already load, and unlike them it renders the post in full — no height clamp —
 * with its reactions aggregated underneath.
 *
 * Two differences from the Nostr Web Components elements elsewhere in the app
 * are worth knowing before touching this: it acquires the page's cache relay
 * itself, so it takes the *upstream* relays and needs no wait on
 * `cacheRelay.resolved`; and it re-subscribes when its attributes change, so it
 * needs no {#key} to notice a new post or a new relay set.
 *
 * `db-name` and `profile-freshness` have to agree with every other holder of
 * that relay — the first acquisition configures it and a mismatch is only a
 * console warning.
 */
import { onMount } from 'svelte';
import { auth } from '../auth.svelte';
import {
  loadNostrTimeline,
  NOSTR_CACHE_DB_NAME,
  NOSTR_CACHE_ORIGIN,
  NOSTR_CACHE_PATH,
  NOSTR_CACHE_PROFILE_FRESHNESS,
  relaysAttr,
} from '../nostrCache';
import { normalizePostRef } from '../postRef';
import BackBar from './BackBar.svelte';

let { id = null }: { id?: string | null } = $props();

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

// Checked here rather than left to the element so a bad link reads as the
// app's own "not found" instead of the widget's error card.
const ref = $derived(normalizePostRef(id));
const relays = $derived(relaysAttr(auth.relays));
</script>

<section>
  <BackBar label="投稿" />

  {#if !ref}
    <p class="empty">投稿が見つかりませんでした。</p>
  {:else if failed}
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
    <!-- No `actions`: the 詳細 button the timelines carry would only lead back
         to the page it was pressed on. -->
    <nostr-post
      event-id={ref}
      {relays}
      db-name={NOSTR_CACHE_DB_NAME}
      profile-freshness={String(NOSTR_CACHE_PROFILE_FRESHNESS)}
    ></nostr-post>
  {/if}
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
  }

  .empty {
    text-align: center;
    color: var(--text-muted);
    padding: 2rem 1rem;
  }
</style>
