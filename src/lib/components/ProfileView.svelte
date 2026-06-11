<script lang="ts">
import { auth } from '../auth.svelte';
import { toHexPubkey, toNpub } from '../nip19';
import { DEFAULT_RELAYS } from '../relays';
import { toast } from '../toast.svelte';
import LoginGate from './LoginGate.svelte';

let { user = null, own = false }: { user?: string | null; own?: boolean } = $props();

const hex = $derived(user ? toHexPubkey(user) : null);
const npub = $derived(hex ? toNpub(hex) : null);

async function copyNpub() {
  if (!npub) return;
  await navigator.clipboard.writeText(npub);
  toast.show('npub をコピーしました');
}
</script>

<section>
  {#if own && !auth.loggedIn}
    <LoginGate message="プロフィールを表示するにはログインが必要です。" />
  {:else if !hex}
    <p class="empty">ユーザーが見つかりませんでした。</p>
  {:else}
    <nostr-profile user={hex} relays={DEFAULT_RELAYS} display="card" nolink="true" theme="light"></nostr-profile>

    <div class="meta">
      {#if npub}
        <code>{npub.slice(0, 20)}…{npub.slice(-6)}</code>
        <button onclick={copyNpub}>コピー</button>
      {/if}
      {#if own}
        <a class="button-like" href="https://nosskey.app" target="_blank" rel="noreferrer">鍵の管理</a>
        <button onclick={() => auth.logout()}>ログアウト</button>
      {/if}
    </div>

    <h2>投稿</h2>
    {#key hex}
      <nostr-list
        filters={JSON.stringify([{ kinds: [1], authors: [hex], limit: 30 }])}
        relays={DEFAULT_RELAYS}
        theme="light"
      ></nostr-list>
    {/key}
  {/if}
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
  }

  .meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
  }

  code {
    font-family: var(--mono);
    font-size: 0.8rem;
    color: var(--text-muted);
    background: var(--bg-subtle);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
  }

  .button-like {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.45rem 1rem;
    color: var(--text);
  }

  .button-like:hover {
    background: var(--bg-subtle);
    text-decoration: none;
  }

  h2 {
    font-size: 1rem;
    margin: 0.75rem 1rem 0.25rem;
    color: var(--gold-strong);
  }

  .empty {
    text-align: center;
    color: var(--text-muted);
    padding: 2rem 1rem;
  }
</style>
