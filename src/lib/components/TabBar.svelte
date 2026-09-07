<script lang="ts">
import { navClick } from '../navClick';
import { navTabs } from '../navTabs';
import { router } from '../router.svelte';
import NavIcon from './NavIcon.svelte';

const active = $derived(router.current.name);
</script>

<nav aria-label="メインナビゲーション">
  {#each navTabs as tab (tab.name)}
    <a
      href={`#${tab.path}`}
      class:active={active === tab.name}
      aria-current={active === tab.name ? 'page' : undefined}
      onclick={navClick[tab.name]}
    >
      <NavIcon name={tab.name} />
      <span>{tab.label}</span>
    </a>
  {/each}
</nav>

<style>
  nav {
    display: flex;
    border-top: 1px solid var(--border);
    background: var(--bg);
    position: sticky;
    bottom: 0;
    z-index: 10;
    padding-bottom: env(safe-area-inset-bottom);
  }

  a {
    --nav-icon-size: 24px;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
    padding: 0.45rem 0 0.4rem;
    color: var(--text-muted);
    font-size: 0.65rem;
  }

  a:hover {
    text-decoration: none;
    color: var(--gold-strong);
  }

  a.active {
    color: var(--gold-strong);
  }

  @media (min-width: 700px) {
    a {
      flex-direction: row;
      gap: 0.5rem;
      font-size: 0.85rem;
      padding: 0.6rem 0;
    }
  }

  /* `SideMenu` takes over at this width. */
  @media (min-width: 900px) {
    nav {
      display: none;
    }
  }
</style>
