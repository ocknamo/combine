<script lang="ts">
import { onMount, tick } from 'svelte';
import { auth } from './lib/auth.svelte';
import { cacheRelay } from './lib/cacheRelay.svelte';
import ComposeView from './lib/components/ComposeView.svelte';
import Header from './lib/components/Header.svelte';
import HomeView from './lib/components/HomeView.svelte';
import NotificationsView from './lib/components/NotificationsView.svelte';
import PostView from './lib/components/PostView.svelte';
import ProfileView from './lib/components/ProfileView.svelte';
import SearchView from './lib/components/SearchView.svelte';
import TabBar from './lib/components/TabBar.svelte';
import { router } from './lib/router.svelte';
import { readScroll, saveScroll, scrollKey } from './lib/scrollMemory';
import { toast } from './lib/toast.svelte';

const route = $derived(router.current);

// The relay set the cache relay is running on, joined so a refresh that returns
// the same relays is not read as a change. `null` until startup has started it.
let relayKeyInUse: string | null = null;

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
    const relays = auth.relays;
    relayKeyInUse = relays.join(',');
    await cacheRelay.start(relays);
  })();
});

// An explicit login or logout replaces the relay set, which the running relay
// cannot adopt (its upstreams were fixed when it started). Restart it.
//
// Nothing to restart while `relayKeyInUse` is null: startup above has not
// started the relay yet and will use whatever relays are current by then.
// Acting here instead would race it and release an acquisition still in flight.
$effect(() => {
  const relays = auth.relays;
  const relayKey = relays.join(',');
  if (relayKeyInUse === null || relayKey === relayKeyInUse) return;
  relayKeyInUse = relayKey;
  // Restarting only writes to the cacheRelay store, which this effect does not
  // read, so it cannot re-trigger itself.
  void cacheRelay.stop().then(() => cacheRelay.start(relays));
});

// A view that keeps its state across a tab switch should also keep its scroll
// position, or coming back still reads as a reload. The page itself is the
// scroll container and a hidden view adds no height to it, so the browser
// clamps the offset as soon as the switch happens — too late to read it back
// then. Record it as the user scrolls instead.
//
// `scrolledKey` is a plain variable, not state: the listener reads it when it
// fires rather than when the effect runs, and making it reactive would only
// re-subscribe the listener on every navigation. It starts at the route the app
// opened on — deliberately the value at that moment, not a reactive read.
let scrolledKey = scrollKey(router.current.name, router.current.param);
$effect(() => {
  const onScroll = () => saveScroll(scrolledKey, window.scrollY);
  window.addEventListener('scroll', onScroll, { passive: true });
  return () => window.removeEventListener('scroll', onScroll);
});

$effect(() => {
  const key = scrollKey(route.name, route.param);
  if (key === scrolledKey) return;
  scrolledKey = key;
  const offset = readScroll(key);
  // After the new view has rendered, so the page is tall enough for the offset
  // to still be reachable. A freshly mounted view has none recorded and starts
  // at the top, which is also what scrolling to 0 does.
  void tick().then(() => window.scrollTo(0, offset));
});
</script>

<div class="app">
  <Header />
  <main>
    <!--
      Home stays mounted and is only hidden. Tearing the timeline down and
      building it again on every tab switch throws away the loaded events, the
      scroll position and the widget's subscriptions, and the user sees it
      reload — even though the cache relay answers from IndexedDB, that is a
      spinner and a jump to the top for something they were just reading.
    -->
    <div class="view-holder" class:hidden={route.name !== 'home'}>
      <HomeView />
    </div>

    {#if route.name === 'search'}
      <SearchView />
    {:else if route.name === 'notifications'}
      <NotificationsView />
    {:else if route.name === 'profile'}
      <ProfileView user={auth.pubkey} own />
    {:else if route.name === 'user'}
      <ProfileView user={route.param} />
    {:else if route.name === 'post'}
      <PostView id={route.param} />
    {/if}

    <!-- Compose stays mounted so the eHagaki draft and bridge survive tab switches -->
    <div class="view-holder" class:hidden={route.name !== 'compose'}>
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

  /* Wrapper for a view that is kept mounted while another one is on screen. */
  .view-holder {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .view-holder.hidden {
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
