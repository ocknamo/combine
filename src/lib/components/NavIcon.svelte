<script lang="ts">
/**
 * The nav icons, shared by the footer tab bar and the PC side menu.
 *
 * Size comes from `--nav-icon-size` on the caller's side: the two bars want
 * different sizes for the same icon.
 */
import type { RouteName } from '../router.svelte';

const { name }: { name: RouteName } = $props();
</script>

{#if name === 'home'}
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h13v-9.5" /></svg>
{:else if name === 'search'}
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>
{:else if name === 'compose'}
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L20.5 7.5a2.1 2.1 0 0 0-3-3L5 17z" /><path d="m14.5 6.5 3 3" /></svg>
{:else if name === 'notifications'}
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9" /><path d="M10 19a2.2 2.2 0 0 0 4 0" /></svg>
{:else}
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg>
{/if}

<style>
  svg {
    width: var(--nav-icon-size, 24px);
    height: var(--nav-icon-size, 24px);
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
