<script lang="ts">
import { auth } from '../auth.svelte';
import type { NostrFilter } from '../nostrCache';
import LoginGate from './LoginGate.svelte';
import TimelineEmbed from './TimelineEmbed.svelte';

// Mentions, reposts, reactions, zaps addressed to me.
const filters = $derived<NostrFilter[] | null>(
  auth.pubkey ? [{ kinds: [1, 6, 7, 9735], '#p': [auth.pubkey], limit: 50 }] : null
);
</script>

<section>
  {#if filters}
    <TimelineEmbed {filters} />
  {:else}
    <LoginGate message="通知を表示するにはログインが必要です。" />
  {/if}
</section>
