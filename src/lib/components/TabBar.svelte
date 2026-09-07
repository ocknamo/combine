<script lang="ts">
import { flushSync } from 'svelte';
import { focusCompose } from '../composeFocus';
import { navTabs } from '../navTabs';
import { type RouteName, router } from '../router.svelte';
import NavIcon from './NavIcon.svelte';

const active = $derived(router.current.name);

/**
 * Tapping ホーム while the timeline is already on screen scrolls back to the
 * top instead of doing nothing.
 *
 * The tabs navigate with plain anchors, and assigning the hash the page is
 * already on pushes no entry and fires no `hashchange` — so without this a tap
 * on the tab the user is standing on is simply swallowed. Going back to the top
 * of the timeline is what the button reads as after scrolling a long way down.
 */
function onHomeClick(event: MouseEvent): void {
  if (active !== 'home') return;
  event.preventDefault();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Tapping 投稿 opens the editor with the caret already in it, so the mobile
 * keyboard comes up on that same tap instead of a second one.
 *
 * Every step is inside the click handler on purpose. iOS Safari raises the
 * keyboard only for a `focus()` made while a user gesture is still running,
 * and letting the anchor navigate would put the move a `hashchange` — a whole
 * task — away. So the route moves here, `flushSync` gets the view on screen
 * (until then it is `display: none`, and nothing inside it can take focus),
 * and the focus follows in the same breath.
 *
 * A modified click is left to the browser: on a desktop that is "open in a new
 * tab", and there is no keyboard to raise there anyway.
 */
function onComposeClick(event: MouseEvent): void {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  router.go('/compose');
  flushSync();
  focusCompose();
}

const clickHandlers: Partial<Record<RouteName, (event: MouseEvent) => void>> = {
  home: onHomeClick,
  compose: onComposeClick,
};
</script>

<nav aria-label="メインナビゲーション">
  {#each navTabs as tab (tab.name)}
    <a
      href={`#${tab.path}`}
      class:active={active === tab.name}
      aria-current={active === tab.name ? 'page' : undefined}
      onclick={clickHandlers[tab.name]}
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
