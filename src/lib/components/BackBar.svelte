<script lang="ts">
/**
 * Header for a view the user drilled into. The tab bar has no entry for such a
 * view, so this is the only way out that does not lose where they came from.
 */
import { router } from '../router.svelte';

let { label }: { label: string } = $props();
</script>

<div class="bar">
  <button type="button" aria-label="戻る" onclick={() => router.back()}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7" /></svg>
  </button>
  <h2>{label}</h2>
</div>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
    position: sticky;
    /* Under the app header, which is sticky at the top with a z-index of 10. */
    top: 3.1rem;
    z-index: 9;
  }

  button {
    display: flex;
    align-items: center;
    border: none;
    background: transparent;
    padding: 0.25rem;
    color: var(--text-muted);
  }

  button:hover {
    background: var(--bg-subtle);
    color: var(--gold-strong);
  }

  svg {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
    color: var(--gold-strong);
  }
</style>
