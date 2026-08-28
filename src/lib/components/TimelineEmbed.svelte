<script lang="ts">
/**
 * The one nostr-cache timeline in the app: every list — home, notifications, a
 * person's posts, hashtag results — is this component, so they all look and
 * behave alike and the attributes below are written once.
 *
 * That matters beyond tidiness: `db-name` and `profile-freshness` have to agree
 * with every other holder of the page's cache relay (the first acquisition
 * configures it and a mismatch is only a console warning), and they have to
 * match what `App.svelte` acquires it with.
 *
 * Which events are shown comes in one of two ways. `follows` picks the
 * follow-timeline element, which resolves the person's kind 3 itself; anything
 * else is a NIP-01 filter set. The two elements differ in nothing else, hence
 * the same attributes on both.
 *
 * The elements acquire the relay themselves, so they take the *upstream*
 * relays rather than the intercept URL, and they re-subscribe on a changed
 * `filters` or `relays` — no {#key} needed, unlike `ProfileCard`.
 *
 * `actions` puts 返信・リポスト・リアクション・共有・詳細 under every row, which is
 * how a list reaches the detail page and acts on a post; `author-action` does
 * the same for each card's avatar and display name, and `note-action` for a
 * quoted card. All of them arrive as `nostr-timeline:action`, which
 * `handlePostAction` acts on — applied here, on the element, so a view that
 * shows two timelines does not need (and must not add) a listener of its own.
 */
import { cacheRelay } from '../cacheRelay.svelte';
import {
  filtersAttr,
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
}: {
  /** NIP-01 filters. Only the first 10 are read. */
  filters?: NostrFilter[] | null;
  /** hex pubkey whose follows to show, instead of `filters`. */
  follows?: string | null;
  /** Comma-separated kinds. Ignored when `filters` says which kinds it wants. */
  kinds?: string;
  limit?: number;
} = $props();

// The widget parses a comma-separated string, unlike nostr-web-components.
// Read from `cacheRelay`, not `auth`: a changed `relays` attribute restarts the
// widget, and `auth.relays` changes seconds into the session — see
// `cacheRelay.svelte.ts`.
const relays = $derived(relaysAttr(cacheRelay.upstreamRelays));

// `filters` replaces the element's own `kinds` / `limit`, which it then ignores
// with a warning — so pass one or the other, never both.
const filtersJson = $derived(filters ? filtersAttr(filters) : undefined);
const kindsAttr = $derived(filters ? undefined : kinds);
const limitAttr = $derived(filters ? undefined : String(limit));
const freshness = String(NOSTR_CACHE_PROFILE_FRESHNESS);
</script>

<WidgetGate>
  {#if follows}
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
      db-name={NOSTR_CACHE_DB_NAME}
      profile-freshness={freshness}
    ></nostr-follow-timeline>
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
      db-name={NOSTR_CACHE_DB_NAME}
      profile-freshness={freshness}
    ></nostr-timeline>
  {/if}
</WidgetGate>
