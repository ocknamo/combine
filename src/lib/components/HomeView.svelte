<script lang="ts">
import { auth } from '../auth.svelte';
import { fetchFollows } from '../follows';
import { DEFAULT_RELAYS, RELAYS_ATTR } from '../relays';

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
  fetchFollows(pubkey, DEFAULT_RELAYS)
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
    <nostr-stream filters={filters} relays={RELAYS_ATTR} theme="light" limit="30"></nostr-stream>
  {/key}
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
</style>
