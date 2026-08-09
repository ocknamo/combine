<script lang="ts">
import { onMount } from 'svelte';
import { auth } from './lib/auth.svelte';
import { cacheRelay } from './lib/cacheRelay.svelte';
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

// A session restored from localStorage never runs login(), so pull the user's
// relays here too.
//
// The cache relay is started only once that has settled. Its upstreams are
// fixed at startup, so starting before the user's relays are known would mean
// standing the relay back up moments later — and tearing it down takes every
// view's subscription with it. Waiting costs one round trip to the signing
// iframe, on a path where the views are showing a placeholder anyway.
onMount(() => {
  void (async () => {
    if (auth.loggedIn) await auth.refreshRelays();
    await cacheRelay.start(auth.relays);
  })();
});

// An explicit login or logout replaces the relay set, which the running relay
// cannot adopt (its upstreams were fixed when it started). Restart it. Keyed on
// the joined list rather than the array so a refresh that returns the same
// relays is not treated as a change.
let lastRelayKey = auth.relays.join(',');
$effect(() => {
  const relayKey = auth.relays.join(',');
  if (relayKey === lastRelayKey) return;
  lastRelayKey = relayKey;
  const relays = auth.relays;
  // Restarting only writes to the cacheRelay store, which this effect does not
  // read, so it cannot re-trigger itself.
  void cacheRelay.stop().then(() => cacheRelay.start(relays));
});
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
