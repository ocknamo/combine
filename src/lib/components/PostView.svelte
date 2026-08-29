<script lang="ts">
/**
 * One post as the subject of the page: `<nostr-post>` renders it in full — no
 * height clamp — with its reactions aggregated underneath.
 *
 * Same relay contract as the timelines (`TimelineEmbed`): the element acquires
 * the cache relay itself, so it takes the upstream relays, and `db-name` /
 * `profile-freshness` have to agree with every other holder.
 */
import { cacheRelay } from '../cacheRelay.svelte';
import {
  NOSTR_CACHE_DB_NAME,
  NOSTR_CACHE_PROFILE_FRESHNESS,
  OGP_PROXY,
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
import WidgetGate from './WidgetGate.svelte';

let { id = null }: { id?: string | null } = $props();

// Checked here rather than left to the element so a bad link reads as the
// app's own "not found" instead of the widget's error card.
const ref = $derived(normalizePostRef(id));
const relays = $derived(relaysAttr(cacheRelay.upstreamRelays));
</script>

<section>
  <BackBar label="投稿" />

  {#if !ref}
    <p class="empty">投稿が見つかりませんでした。</p>
  {:else}
    <WidgetGate>
      <!-- The timelines' row minus 詳細, which would lead back to this page.
           The widget's reply tree takes no `actions`, so the row is the post's
           own; `author-action` and `note-action` add none but still lead away. -->
      <nostr-post
        use:handlePostAction
        event-id={ref}
        actions={POST_PAGE_ACTIONS_ATTR}
        author-action={AUTHOR_ACTION_ID}
        note-action={NOTE_ACTION_ID}
        material-icons={MATERIAL_ICONS}
        {relays}
        ogp-proxy={OGP_PROXY}
        db-name={NOSTR_CACHE_DB_NAME}
        profile-freshness={String(NOSTR_CACHE_PROFILE_FRESHNESS)}
      ></nostr-post>
    </WidgetGate>
  {/if}
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
  }
</style>
