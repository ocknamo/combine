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
 * itself, so it takes the *upstream* relays rather than the intercept URL — it
 * waits on `cacheRelay.resolved` all the same, since those relays are only
 * settled once the relay has been started with them (see
 * `cacheRelay.svelte.ts`); and it re-subscribes when its attributes change, so
 * it needs no {#key} to notice a new post or a new relay set.
 *
 * `db-name` and `profile-freshness` have to agree with every other holder of
 * that relay — the first acquisition configures it and a mismatch is only a
 * console warning.
 */
import { onMount } from 'svelte';
import { cacheRelay } from '../cacheRelay.svelte';
import {
  loadNostrTimeline,
  NOSTR_CACHE_DB_NAME,
  NOSTR_CACHE_ORIGIN,
  NOSTR_CACHE_PATH,
  NOSTR_CACHE_PROFILE_FRESHNESS,
  relaysAttr,
} from '../nostrCache';
import { handlePostAction } from '../postAction';
import {
  AUTHOR_ACTION_ID,
  MATERIAL_ICONS,
  NOTE_ACTION_ID,
  normalizePostRef,
  POST_PAGE_ACTIONS_ATTR,
} from '../postRef';
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
const relays = $derived(relaysAttr(cacheRelay.upstreamRelays));
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
  {:else if !ready || !cacheRelay.resolved}
    <p class="empty">読み込み中…</p>
  {:else}
    <!-- The timelines' row minus 詳細. Only the post itself carries it: the
         widget's reply tree takes no `actions`. `author-action` and
         `note-action` add no row at all, and everything they point at (the
         author, every author in the reply tree, and the posts this one quotes)
         is somewhere else to go. -->
    <nostr-post
      use:handlePostAction
      event-id={ref}
      actions={POST_PAGE_ACTIONS_ATTR}
      author-action={AUTHOR_ACTION_ID}
      note-action={NOTE_ACTION_ID}
      material-icons={MATERIAL_ICONS}
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
