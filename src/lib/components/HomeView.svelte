<script lang="ts">
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

type Feed = 'follows' | 'global';

let feed = $state<Feed>('global');
let ready = $state(false);
let failed = $state(false);

// Pick the default tab whenever the signed-in user changes — including a login
// or an account switch made at nosskey.app after this view mounted. Keyed on
// the pubkey rather than run on every change so it never overrides a tab the
// user picked themselves.
let lastPubkey: string | null = null;
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
const relays = $derived(relaysAttr(auth.relays));
</script>

<section>
  {#if auth.loggedIn}
    <div class="feed-switch" role="tablist" aria-label="タイムライン切り替え">
      <button
        role="tab"
        aria-selected={feed === 'follows'}
        class:active={feed === 'follows'}
        onclick={() => (feed = 'follows')}
      >
        フォロー中
      </button>
      <button
        role="tab"
        aria-selected={feed === 'global'}
        class:active={feed === 'global'}
        onclick={() => (feed = 'global')}
      >
        グローバル
      </button>
    </div>
  {/if}

  <!--
    One element at a time: the page shares a single in-page relay, and the
    widgets' attributes are reactive, so mounting both would only duplicate
    subscriptions. `db-name`, `relays` and `profile-freshness` are kept
    identical between them, and match what `App.svelte` acquires the relay with
    — whoever gets there first configures it, and a mismatch is ignored with a
    console warning.
  -->
  {#if failed}
    <p class="empty">
      タイムラインを読み込めませんでした。
      <a href={`${NOSTR_CACHE_ORIGIN}${NOSTR_CACHE_PATH}`} target="_blank" rel="noreferrer">
        nostr-cache
      </a>
      に接続できない可能性があります。
    </p>
  {:else if !ready}
    <p class="empty">読み込み中…</p>
  {:else if feed === 'follows' && auth.pubkey}
    <nostr-follow-timeline
      pubkey={auth.pubkey}
      {relays}
      kinds="1"
      limit="50"
      db-name={NOSTR_CACHE_DB_NAME}
      profile-freshness={String(NOSTR_CACHE_PROFILE_FRESHNESS)}
    ></nostr-follow-timeline>
  {:else}
    <nostr-timeline
      kinds="1"
      limit="50"
      {relays}
      db-name={NOSTR_CACHE_DB_NAME}
      profile-freshness={String(NOSTR_CACHE_PROFILE_FRESHNESS)}
    ></nostr-timeline>
  {/if}

  <p class="credit">
    タイムラインの表示と全ビューのキャッシュには
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

  /*
    The widget renders into a shadow root, so these custom properties are the
    only way in. Names come from the timeline-embed README.
  */
  nostr-timeline,
  nostr-follow-timeline {
    --nt-fg: var(--text);
    --nt-muted: var(--text-muted);
    --nt-border: var(--border);
    --nt-separator: var(--border);
    --nt-name-fg: var(--text);
    --nt-handle-fg: var(--text-muted);
    --nt-link-fg: var(--gold-strong);
    --nt-mention-fg: var(--gold-strong);
    --nt-quote-bar: var(--gold);
    --nt-media-bg: var(--bg-subtle);
  }

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
