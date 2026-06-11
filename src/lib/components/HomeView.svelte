<script lang="ts">
import { auth } from '../auth.svelte';
import { fetchFollows } from '../follows';

type Feed = 'follows' | 'global';
let feed = $state<Feed>('global');
let follows = $state<string[] | null>(null);
let loadingFollows = $state(false);

$effect(() => {
  const pubkey = auth.pubkey;
  if (!pubkey) {
    follows = null;
    feed = 'global';
    return;
  }
  loadingFollows = true;
  fetchFollows(pubkey, auth.relays)
    .then((result) => {
      follows = result;
      if (result.length > 0) feed = 'follows';
    })
    .finally(() => {
      loadingFollows = false;
    });
});

// Relay filters expect hex authors; kind 3 p-tags are already hex.
const filters = $derived.by(() => {
  if (feed === 'follows' && follows && follows.length > 0) {
    return JSON.stringify([{ kinds: [1], authors: follows.slice(0, 500), limit: 30 }]);
  }
  return JSON.stringify([{ kinds: [1], limit: 30 }]);
});
</script>

<section>
  {#if auth.loggedIn}
    <div class="feed-switch" role="tablist" aria-label="タイムライン切り替え">
      <button
        role="tab"
        aria-selected={feed === 'follows'}
        class:active={feed === 'follows'}
        onclick={() => (feed = 'follows')}
        disabled={!follows || follows.length === 0}
      >
        フォロー中{loadingFollows ? '…' : ''}
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
    {#if feed === 'follows' && follows && follows.length === 0 && !loadingFollows}
      <p class="empty">フォローしているユーザーが見つかりませんでした。</p>
    {/if}
  {/if}

  {#key filters}
    <nostr-stream filters={filters} relays={auth.relays} theme="light" limit="30"></nostr-stream>
  {/key}

  <p class="credit">
    タイムラインやプロフィールの表示には
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
