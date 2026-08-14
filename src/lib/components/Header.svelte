<script lang="ts">
import { auth } from '../auth.svelte';
import { cacheRelay } from '../cacheRelay.svelte';
import { router } from '../router.svelte';
import { truncateName } from '../truncateName';

const iconUrl = `${import.meta.env.BASE_URL}icon.png`;

// nostr-profile, like nostr-list, does not react to a changed `relays`, so the
// element is keyed on the connection target and rebuilt when it moves.
const relayKey = $derived(cacheRelay.viewRelays.join(','));
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
      {#if cacheRelay.resolved}
        {#key relayKey}
          <nostr-profile
            use:truncateName={'name'}
            user={auth.pubkey ?? undefined}
            relays={cacheRelay.viewRelays}
            display="name"
            nolink="true"
            theme="light"
          ></nostr-profile>
        {/key}
      {/if}
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
    /* nostr-profile's name can render unclamped (white-space: nowrap) for a
       frame before truncateName's shadow-root style lands, and as a flex item
       this button's default min-width: auto would let that push the header
       (and the whole page) wider than the viewport. */
    min-width: 0;
    overflow: hidden;
  }

  .ghost:hover {
    background: var(--bg-subtle);
  }
</style>
