<script lang="ts">
import { auth } from '../auth.svelte';
import { follows } from '../follows.svelte';
import { type SwipeDirection, swipeHorizontal } from '../swipe';
import TimelineEmbed from './TimelineEmbed.svelte';

type Feed = 'follows' | 'global';

// Start on the tab a session restored from localStorage implies. The effect
// below would switch to it anyway, but only after the first render — long
// enough to mount the global feed and leave it mounted for the rest of the
// session, now that a mounted feed is kept.
let feed = $state<Feed>(auth.pubkey ? 'follows' : 'global');

// The feed actually on screen. `follows` needs a pubkey, so a logged-out user
// (or one whose session has not been restored yet) always gets `global`.
const active = $derived<Feed>(feed === 'follows' && auth.pubkey ? 'follows' : 'global');

// Whether each feed has been on screen at least once (see the template).
// Mounting lazily keeps the second subscription off the wire for a session that
// never leaves the tab it landed on.
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
  The swipe listener sits above both feeds so the gesture works over the feed
  itself, where the user's thumb is, not only over the switcher. It never calls
  `preventDefault()`, so scrolling and taps inside the cards are untouched —
  and card taps are `TimelineEmbed`'s, so add no listener for them here.
-->
<section use:swipeHorizontal={onSwipe}>
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
    A feed the user has opened stays mounted and is only hidden: taking a widget
    out of the DOM destroys it, and rebuilding the list read as a reload on
    every tab switch. The cost is a second subscription once both are open — but
    through the same in-page relay and IndexedDB, not a second trip upstream.
  -->
  <!--
    Dropped on logout: the element has no feed to show without a pubkey.

    kind 6 but not 16: NIP-18 uses 16 for reposts of everything *but* notes, and
    nothing else in the app shows those kinds, so the card would embed a post
    the timeline cannot draw. `limit` is a budget across both kinds, left at 50
    because the widget has no load-more and a larger first REQ costs every visit.
  -->
  {#if openedFollows && auth.pubkey}
    <div class="feed" class:hidden={active !== 'follows'}>
      <!-- Rebuilt after a follow: the element resolves kind 3 only when built,
           so the feed would otherwise keep the follows the tab opened with. -->
      <TimelineEmbed follows={auth.pubkey} kinds="1,6" limit={50} reloadKey={follows.revision} />
    </div>
  {/if}
  {#if openedGlobal}
    <div class="feed" class:hidden={active !== 'global'}>
      <TimelineEmbed kinds="1" limit={50} />
    </div>
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

  .credit {
    margin: 0;
    padding: 0.6rem 1rem calc(0.6rem + env(safe-area-inset-bottom));
    font-size: 0.75rem;
    color: var(--text-muted);
    border-top: 1px solid var(--border);
    text-align: center;
  }
</style>
