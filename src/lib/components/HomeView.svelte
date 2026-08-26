<script lang="ts">
import { onMount } from 'svelte';
import { auth } from '../auth.svelte';
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
import { AUTHOR_ACTION_ID, MATERIAL_ICONS, NOTE_ACTION_ID, POST_ACTIONS_ATTR } from '../postRef';
import { type SwipeDirection, swipeHorizontal } from '../swipe';

type Feed = 'follows' | 'global';

// Start on the tab a session restored from localStorage implies. The effect
// below would switch to it anyway, but only after the first render — long
// enough to mount the global feed and leave it mounted for the rest of the
// session, now that a mounted feed is kept.
let feed = $state<Feed>(auth.pubkey ? 'follows' : 'global');
let ready = $state(false);
let failed = $state(false);

// The feed actually on screen. `follows` needs a pubkey, so a logged-out user
// (or one whose session has not been restored yet) always gets `global`.
const active = $derived<Feed>(feed === 'follows' && auth.pubkey ? 'follows' : 'global');

// Whether each feed has been on screen at least once. Both widgets stay mounted
// from then on and are only hidden, so switching back is instant instead of a
// refetch — see the template. Mounting them lazily keeps the second
// subscription off the wire for a session that never leaves the tab it landed
// on.
let openedFollows = $state(false);
let openedGlobal = $state(false);
$effect(() => {
  // Writes only — this effect reads neither flag, so it cannot re-trigger
  // itself.
  if (active === 'follows') openedFollows = true;
  else openedGlobal = true;
});

// Pick the default tab whenever the signed-in user changes — including a login
// or an account switch made at nosskey.app after this view mounted. Keyed on
// the pubkey rather than run on every change so it never overrides a tab the
// user picked themselves.
let lastPubkey: string | null = auth.pubkey;
$effect(() => {
  const pubkey = auth.pubkey;
  if (pubkey === lastPubkey) return;
  lastPubkey = pubkey;
  feed = pubkey ? 'follows' : 'global';
});

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

// The widget parses a comma-separated string, unlike nostr-web-components.
// Read from `cacheRelay`, not `auth`: a changed `relays` attribute restarts the
// widget, and `auth.relays` changes seconds into the session — see
// `cacheRelay.svelte.ts`.
const relays = $derived(relaysAttr(cacheRelay.upstreamRelays));

// Swiping moves along the switcher, the way the tabs are laid out: dragging
// left pulls グローバル in from the right, dragging right pulls フォロー中 back.
// A swipe past either end does nothing — there is no third feed to wrap to,
// and wrapping would land the user somewhere they did not aim for.
//
// Only meaningful while both tabs exist; logged out there is just グローバル.
function onSwipe(direction: SwipeDirection): void {
  if (!auth.loggedIn) return;
  feed = direction === 'left' ? 'global' : 'follows';
}
</script>

<!--
  One listener covers both feeds: the action event bubbles and is composed.

  The swipe listener sits at the same level so the gesture works over the feed
  itself, not only over the switcher — that is where the user's thumb is. It
  recognises the swipe only once the finger is up and never calls
  `preventDefault()`, so scrolling and taps inside the cards are untouched.
-->
<section use:handlePostAction use:swipeHorizontal={onSwipe}>
  {#if auth.loggedIn}
    <div class="feed-switch" role="tablist" aria-label="タイムライン切り替え">
      <button
        role="tab"
        aria-selected={active === 'follows'}
        class:active={active === 'follows'}
        onclick={() => (feed = 'follows')}
      >
        フォロー中
      </button>
      <button
        role="tab"
        aria-selected={active === 'global'}
        class:active={active === 'global'}
        onclick={() => (feed = 'global')}
      >
        グローバル
      </button>
    </div>
  {/if}

  <!--
    A feed the user has opened is kept mounted and only hidden when they switch
    away. The widgets are Svelte custom elements: taking one out of the DOM
    destroys it, and putting it back means re-subscribing and rebuilding the
    list from scratch, so switching tabs looked like a reload every time.
    The cost is that once both have been opened, both hold a subscription — but
    they read through the same in-page relay and the same IndexedDB, so it is a
    second subscription, not a second trip upstream.

    `db-name`, `relays`, `profile-freshness` and `actions` are kept identical
    between them, and the first three match what `App.svelte` acquires the relay
    with — whoever gets there first configures it, and a mismatch is ignored
    with a console warning.
  -->
  {#if failed}
    <p class="empty">
      タイムラインを読み込めませんでした。
      <a href={`${NOSTR_CACHE_ORIGIN}${NOSTR_CACHE_PATH}`} target="_blank" rel="noreferrer">
        nostr-cache
      </a>
      に接続できない可能性があります。
    </p>
  {:else if !ready || !cacheRelay.resolved}
    <!-- Waiting for the relay is waiting for the relay set to settle: a widget
         mounted before that restarts, taking the page relay with it — the app
         is not holding one yet. -->
    <p class="empty">読み込み中…</p>
  {:else}
    <!-- Dropped on logout: the element has no feed to show without a pubkey. -->
    {#if openedFollows && auth.pubkey}
      <div class="feed" class:hidden={active !== 'follows'}>
        <nostr-follow-timeline
          pubkey={auth.pubkey}
          {relays}
          kinds="1"
          limit="50"
          actions={POST_ACTIONS_ATTR}
          author-action={AUTHOR_ACTION_ID}
          note-action={NOTE_ACTION_ID}
          material-icons={MATERIAL_ICONS}
          db-name={NOSTR_CACHE_DB_NAME}
          profile-freshness={String(NOSTR_CACHE_PROFILE_FRESHNESS)}
        ></nostr-follow-timeline>
      </div>
    {/if}
    {#if openedGlobal}
      <div class="feed" class:hidden={active !== 'global'}>
        <nostr-timeline
          kinds="1"
          limit="50"
          {relays}
          actions={POST_ACTIONS_ATTR}
          author-action={AUTHOR_ACTION_ID}
          note-action={NOTE_ACTION_ID}
          material-icons={MATERIAL_ICONS}
          db-name={NOSTR_CACHE_DB_NAME}
          profile-freshness={String(NOSTR_CACHE_PROFILE_FRESHNESS)}
        ></nostr-timeline>
      </div>
    {/if}
  {/if}

  <p class="credit">
    投稿一覧の表示と全ビューのキャッシュには
    <a href="https://github.com/ocknamo/nostr-cache" target="_blank" rel="noreferrer">nostr-cache</a>
    の透過キャッシュを、プロフィールなどの表示には
    <a href="https://github.com/TsukemonoGit/nostr-web-components" target="_blank" rel="noreferrer">Nostr Web Components</a>
    を使用しています。
  </p>
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
  }

  .feed-switch {
    display: flex;
    border-bottom: 1px solid var(--border);
  }

  .feed-switch button {
    flex: 1;
    border: none;
    border-radius: 0;
    background: transparent;
    padding: 0.7rem 0;
    color: var(--text-muted);
    border-bottom: 2px solid transparent;
  }

  .feed-switch button.active {
    color: var(--gold-strong);
    border-bottom-color: var(--gold);
    font-weight: 600;
  }

  /* Wrapper for a feed that is kept mounted while the other one is on screen. */
  .feed {
    display: flex;
    flex-direction: column;
  }

  .feed.hidden {
    display: none;
  }

  /* The widgets themselves are themed in `app.css` — every view embeds one. */

  .empty {
    text-align: center;
    color: var(--text-muted);
    padding: 2rem 1rem;
  }

  .credit {
    margin: 0;
    padding: 0.6rem 1rem calc(0.6rem + env(safe-area-inset-bottom));
    font-size: 0.75rem;
    color: var(--text-muted);
    border-top: 1px solid var(--border);
    text-align: center;
  }
</style>
