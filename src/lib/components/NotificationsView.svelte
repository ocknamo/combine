<script lang="ts">
import { auth } from '../auth.svelte';
import { cacheRelay } from '../cacheRelay.svelte';
import LoginGate from './LoginGate.svelte';

// Mentions, reposts, reactions, zaps addressed to me.
const filters = $derived(
  auth.pubkey ? JSON.stringify([{ kinds: [1, 6, 7, 9735], '#p': [auth.pubkey], limit: 50 }]) : null
);

// Part of the {#key} below, not just a prop: nostr-list@0.3.0 ignores a changed
// `relays`, so the element has to be rebuilt when the connection target moves.
const relayKey = $derived(cacheRelay.viewRelays.join(','));
</script>

<section>
  {#if filters}
    {#if cacheRelay.resolved}
      {#key `${filters}|${relayKey}`}
        <nostr-list
          filters={filters}
          relays={cacheRelay.viewRelays}
          theme="light"
          limit="50"
        ></nostr-list>
      {/key}
    {:else}
      <p class="empty">読み込み中…</p>
    {/if}
  {:else}
    <LoginGate message="通知を表示するにはログインが必要です。" />
  {/if}
</section>

<style>
  .empty {
    text-align: center;
    color: var(--text-muted);
    padding: 2rem 1rem;
  }
</style>
