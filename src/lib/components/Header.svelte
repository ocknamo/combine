<script lang="ts">
import { auth } from '../auth.svelte';
import { router } from '../router.svelte';

const iconUrl = `${import.meta.env.BASE_URL}icon.png`;
</script>

<header>
  <a class="brand" href="#/" aria-label="ホームへ">
    <img src={iconUrl} alt="" width="28" height="28" />
    <span>combine</span>
  </a>
  {#if !auth.loggedIn}
    <button class="primary" onclick={() => auth.login()} disabled={auth.busy}>
      {auth.busy ? '接続中…' : 'ログイン'}
    </button>
  {:else}
    <button class="ghost" onclick={() => router.go('/profile')} aria-label="プロフィール">
      <nostr-profile
        user={auth.pubkey ?? undefined}
        relays={auth.relays}
        display="name"
        nolink="true"
        theme="light"
      ></nostr-profile>
    </button>
  {/if}
</header>

<style>
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.6rem 1rem;
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    background: var(--bg);
    z-index: 10;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--gold-strong);
    font-weight: 700;
    font-size: 1.15rem;
    letter-spacing: 0.02em;
  }

  .brand:hover {
    text-decoration: none;
  }

  .brand img {
    display: block;
    border-radius: 50%;
  }

  .ghost {
    border: none;
    background: transparent;
    padding: 0.2rem 0.4rem;
  }

  .ghost:hover {
    background: var(--bg-subtle);
  }
</style>
