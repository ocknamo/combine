<script lang="ts">
import { auth } from '../auth.svelte';
import { RELAYS_ATTR } from '../relays';
import LoginGate from './LoginGate.svelte';

// Mentions, reposts, reactions, zaps addressed to me.
const filters = $derived(
  auth.pubkey ? JSON.stringify([{ kinds: [1, 6, 7, 9735], '#p': [auth.pubkey], limit: 50 }]) : null
);
</script>

<section>
  {#if filters}
    {#key filters}
      <nostr-list filters={filters} relays={RELAYS_ATTR} theme="light" limit="50"></nostr-list>
    {/key}
  {:else}
    <LoginGate message="通知を表示するにはログインが必要です。" />
  {/if}
</section>
