<script lang="ts">
import { auth } from './lib/auth.svelte';
import ComposeView from './lib/components/ComposeView.svelte';
import Header from './lib/components/Header.svelte';
import HomeView from './lib/components/HomeView.svelte';
import NotificationsView from './lib/components/NotificationsView.svelte';
import ProfileView from './lib/components/ProfileView.svelte';
import SearchView from './lib/components/SearchView.svelte';
import TabBar from './lib/components/TabBar.svelte';
import { router } from './lib/router.svelte';
import { toast } from './lib/toast.svelte';

const route = $derived(router.current);
</script>

<div class="app">
  <Header />
  <main>
    {#if route.name === 'home'}
      <HomeView />
    {:else if route.name === 'search'}
      <SearchView />
    {:else if route.name === 'notifications'}
      <NotificationsView />
    {:else if route.name === 'profile'}
      <ProfileView user={auth.pubkey} own />
    {:else if route.name === 'user'}
      <ProfileView user={route.param} />
    {/if}

    <!-- Compose stays mounted so the eHagaki draft and bridge survive tab switches -->
    <div class="compose-holder" class:hidden={route.name !== 'compose'}>
      <ComposeView />
    </div>
  </main>
  <TabBar />

  {#if toast.items.length > 0}
    <div class="toasts" aria-live="polite">
      {#each toast.items as item (item.id)}
        <p class:error={item.kind === 'error'}>{item.message}</p>
      {/each}
    </div>
  {/if}
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    max-width: 640px;
    margin: 0 auto;
    border-left: 1px solid var(--border);
    border-right: 1px solid var(--border);
    background: var(--bg);
  }

  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .compose-holder {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .compose-holder.hidden {
    display: none;
  }

  .toasts {
    position: fixed;
    bottom: 4.5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: min(92vw, 24rem);
  }

  .toasts p {
    margin: 0;
    padding: 0.6rem 1rem;
    background: var(--gold);
    color: #fff;
    border-radius: 6px;
    text-align: center;
  }

  .toasts p.error {
    background: var(--danger);
  }

  @media (max-width: 640px) {
    .app {
      border-left: none;
      border-right: none;
    }
  }
</style>
