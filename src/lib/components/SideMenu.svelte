<script lang="ts">
/**
 * The PC-width navigation: a column of round icon buttons left of the app.
 *
 * Takes over from `TabBar` at the same width the tab bar hides itself at, so
 * exactly one of the two is on screen.
 */
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
      class:compose={tab.name === 'compose'}
      aria-current={active === tab.name ? 'page' : undefined}
      aria-label={tab.label}
      title={tab.label}
    >
      <NavIcon name={tab.name} />
    </a>
  {/each}
</nav>

<style>
  nav {
    display: none;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 0.5rem;
    position: sticky;
    top: 0;
    align-self: flex-start;
  }

  a {
    --nav-icon-size: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3rem;
    height: 3rem;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text-muted);
  }

  a:hover {
    text-decoration: none;
    background: var(--bg-subtle);
    color: var(--gold-strong);
    border-color: var(--gold);
  }

  a.active {
    color: var(--gold-strong);
    border-color: var(--gold);
    background: var(--bg-subtle);
  }

  /* 投稿 is the one thing the user comes here to do, so it gets the filled
     circle instead of an outline like the destinations around it. */
  a.compose {
    --nav-icon-size: 26px;
    width: 3.25rem;
    height: 3.25rem;
    background: var(--gold);
    border-color: var(--gold);
    color: #fff;
  }

  a.compose:hover,
  a.compose.active {
    background: var(--gold-strong);
    border-color: var(--gold-strong);
    color: #fff;
  }

  @media (min-width: 900px) {
    nav {
      display: flex;
    }
  }
</style>
