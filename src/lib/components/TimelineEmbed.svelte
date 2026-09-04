<script lang="ts">
/**
 * Every list in the app — home, notifications, a person's posts, hashtag
 * results. One component because `db-name` and `profile-freshness` have to
 * agree with every other holder of the page's cache relay, `App.svelte`
 * included: the first acquisition configures it and a mismatch is only a
 * console warning.
 *
 * The elements acquire that relay themselves, so they take the *upstream*
 * relays rather than the intercept URL, and they re-subscribe on a changed
 * attribute — no {#key} needed, unlike `ProfileCard`.
 *
 * Both action attributes arrive as `nostr-timeline:action`, listened for on the
 * element itself, so a view showing two timelines must not add a listener of
 * its own — it would act twice on one tap.
 */
import { cacheRelay } from '../cacheRelay.svelte';
import {
  filtersAttr,
  IMAGE_PROXY,
  NOSTR_CACHE_DB_NAME,
  NOSTR_CACHE_PROFILE_FRESHNESS,
  type NostrFilter,
  OGP_PROXY,
  relaysAttr,
} from '../nostrCache';
import { handlePostAction } from '../postAction';
import { AUTHOR_ACTION_ID, MATERIAL_ICONS, NOTE_ACTION_ID, POST_ACTIONS_ATTR } from '../postRef';
import WidgetGate from './WidgetGate.svelte';

let {
  filters = null,
  follows = null,
  kinds = '1',
  limit = 50,
  reloadKey = 0,
}: {
  /** NIP-01 filters. Only the first 10 are read. */
  filters?: NostrFilter[] | null;
  /** hex pubkey whose follows to show. Picks the element that resolves kind 3. */
  follows?: string | null;
  /** Comma-separated. */
  kinds?: string;
  limit?: number;
  /**
   * Change this to rebuild the follow timeline from scratch. Only that element
   * reads it — it resolves kind 3 once when it is built and never again, so a
   * follow published afterwards is invisible until it is rebuilt. See the
   * template for what a rebuild costs.
   */
  reloadKey?: number;
} = $props();

// From `cacheRelay`, not `auth`: a changed `relays` restarts the widget, and
// `auth.relays` changes seconds into the session (`cacheRelay.svelte.ts`).
const relays = $derived(relaysAttr(cacheRelay.upstreamRelays));

// `filters` replaces the element's `kinds` / `limit`, which it then ignores
// with a warning — so pass one or the other, never both.
const filtersJson = $derived(filters ? filtersAttr(filters) : undefined);
const kindsAttr = $derived(filters ? undefined : kinds);
const limitAttr = $derived(filters ? undefined : String(limit));
const freshness = String(NOSTR_CACHE_PROFILE_FRESHNESS);
</script>

<WidgetGate>
  {#if follows}
    <!--
      Keyed on `reloadKey` so following someone shows up in the feed. Rebuilding
      drops the posts on screen and the subscription behind them, which is why
      nothing else in the app does it — but the kind 3 it re-reads was published
      through the in-page relay and is already in IndexedDB, so the rebuild is
      served from the cache rather than a round trip, and it happens only right
      after the user changed who they follow.
    -->
    {#key reloadKey}
      <nostr-follow-timeline
        use:handlePostAction
        pubkey={follows}
        kinds={kindsAttr}
        limit={limitAttr}
        {relays}
        actions={POST_ACTIONS_ATTR}
        author-action={AUTHOR_ACTION_ID}
        note-action={NOTE_ACTION_ID}
        material-icons={MATERIAL_ICONS}
        ogp-proxy={OGP_PROXY}
        image-proxy={IMAGE_PROXY}
        db-name={NOSTR_CACHE_DB_NAME}
        profile-freshness={freshness}
      ></nostr-follow-timeline>
    {/key}
  {:else}
    <nostr-timeline
      use:handlePostAction
      filters={filtersJson}
      kinds={kindsAttr}
      limit={limitAttr}
      {relays}
      actions={POST_ACTIONS_ATTR}
      author-action={AUTHOR_ACTION_ID}
      note-action={NOTE_ACTION_ID}
      material-icons={MATERIAL_ICONS}
      ogp-proxy={OGP_PROXY}
      image-proxy={IMAGE_PROXY}
      db-name={NOSTR_CACHE_DB_NAME}
      profile-freshness={freshness}
    ></nostr-timeline>
  {/if}
</WidgetGate>
