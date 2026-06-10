<script lang="ts">
import { router } from '../router.svelte';

const tabs = [
  { path: '/', name: 'home', label: 'ホーム' },
  { path: '/search', name: 'search', label: '検索' },
  { path: '/compose', name: 'compose', label: '投稿' },
  { path: '/notifications', name: 'notifications', label: '通知' },
  { path: '/profile', name: 'profile', label: 'プロフィール' },
] as const;

const active = $derived(router.current.name);
</script>

<nav aria-label="メインナビゲーション">
  {#each tabs as tab (tab.name)}
    <a href={`#${tab.path}`} class:active={active === tab.name} aria-current={active === tab.name ? 'page' : undefined}>
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
