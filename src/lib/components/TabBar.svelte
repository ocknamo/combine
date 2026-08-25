<script lang="ts">
import { flushSync } from 'svelte';
import { focusCompose } from '../composeFocus';
import { type RouteName, router } from '../router.svelte';

const tabs = [
  { path: '/', name: 'home', label: 'ホーム' },
  { path: '/search', name: 'search', label: '検索' },
  { path: '/compose', name: 'compose', label: '投稿' },
  { path: '/notifications', name: 'notifications', label: '通知' },
  { path: '/profile', name: 'profile', label: 'プロフィール' },
] as const;

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
  {#each tabs as tab (tab.name)}
    <a
      href={`#${tab.path}`}
      class:active={active === tab.name}
      aria-current={active === tab.name ? 'page' : undefined}
      onclick={clickHandlers[tab.name]}
    >
      {#if tab.name === 'home'}
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h13v-9.5" /></svg>
      {:else if tab.name === 'search'}
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>
      {:else if tab.name === 'compose'}
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L20.5 7.5a2.1 2.1 0 0 0-3-3L5 17z" /><path d="m14.5 6.5 3 3" /></svg>
      {:else if tab.name === 'notifications'}
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9" /><path d="M10 19a2.2 2.2 0 0 0 4 0" /></svg>
      {:else}
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg>
      {/if}
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

  svg {
    width: 24px;
    height: 24px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  @media (min-width: 700px) {
    a {
      flex-direction: row;
      gap: 0.5rem;
      font-size: 0.85rem;
      padding: 0.6rem 0;
    }
  }
</style>
