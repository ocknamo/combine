<script lang="ts">
/**
 * Cache deletion, while it happens. Emptying IndexedDB takes long enough that a
 * button which only dims looks broken, and the reload that follows would arrive
 * unannounced — so the whole run gets a panel of its own.
 *
 * Mounting starts the deletion: the caller decides when it runs by deciding
 * when this exists.
 */
import { cacheRelay } from '../cacheRelay.svelte';

let { onfail }: { onfail: () => void } = $props();

let done = $state(false);
let reloadButton = $state<HTMLButtonElement | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;

// Reachable twice — the timer and the tap — and the second reload would abort
// the first one's request.
function reload() {
  clearTimeout(timer);
  location.reload();
}

$effect(() => {
  void (async () => {
    try {
      await cacheRelay.clearCache();
    } catch {
      onfail();
      return;
    }
    done = true;
    // Long enough to read the result, short enough not to read as a hang.
    timer = setTimeout(reload, 1000);
  })();
  return () => clearTimeout(timer);
});

// The tap fallback is only a fallback if it can be reached without a pointer.
$effect(() => {
  reloadButton?.focus();
});
</script>

<div class="backdrop">
  <div class="dialog" role="alertdialog" aria-live="polite" aria-labelledby="cache-clear-title">
    {#if done}
      <p class="title" id="cache-clear-title">キャッシュ削除完了</p>
      <!-- The line that promises the reload performs it too: a backgrounded
           Safari tab can hold the timer until the page is looked at again. -->
      <button class="reload" bind:this={reloadButton} onclick={reload}>リロードします</button>
    {:else}
      <span class="spinner" aria-hidden="true"></span>
      <p class="title" id="cache-clear-title">削除中です</p>
      <p class="note">完了したらリロードします</p>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    /* Over the sticky header and tab bar, under the Nosskey signing overlay. */
    z-index: 900;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(43, 38, 32, 0.45);
  }

  .dialog {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    width: min(18rem, 100%);
    padding: 1.25rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    text-align: center;
  }

  .title {
    margin: 0;
    font-weight: 600;
  }

  .note {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  /* Reads as the same line as the note above it in the other state, with an
     underline as the only cue that this one can be pressed. */
  .reload {
    border: none;
    background: none;
    padding: 0.25rem 0.5rem;
    font-size: 0.85rem;
    color: var(--gold-strong);
    text-decoration: underline;
  }

  .reload:hover {
    background: none;
  }

  /* The browser default is a black double ring, which lands as the loudest
     thing on the panel a second before the page goes away. */
  .reload:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .spinner {
    width: 1.5rem;
    height: 1.5rem;
    border: 2px solid var(--text-muted);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation-duration: 2.4s;
    }
  }
</style>
