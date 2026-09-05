<script lang="ts">
/**
 * The follow button on a person's page. Deliberately dumb: every state exists
 * to stop a contact list being overwritten with less than it had, so which one
 * is safe belongs to `follows` and this only renders it — the pressed state
 * included, which the store shows before the publish returns.
 */
import { auth } from '../auth.svelte';
import { follows } from '../follows.svelte';

let { hex }: { hex: string } = $props();

const shown = $derived(auth.loggedIn && hex !== auth.pubkey);

// Only for display: every change re-reads from the relays first, so a few
// minutes old costs nothing but a briefly wrong label.
$effect(() => {
  if (shown) void follows.ensureLoaded();
});

// Already the state the in-flight change is publishing: the label moves on the
// press, and only an error moves it back.
const following = $derived(follows.isFollowing(hex));
const busy = $derived(follows.pending === hex);
// Two changes at once would have the second undo the first, including one
// started from another person's page.
const blocked = $derived(follows.pending !== null && !busy);
const asking = $derived(follows.needsBootstrap === hex);
</script>

{#if shown}
  <div class="follow">
    {#if follows.status === 'loading'}
      <button disabled>読み込み中…</button>
    {:else if follows.status === 'unavailable'}
      <!-- Not a disabled follow button: a pressable one here would publish over
           follows we never saw. -->
      <button onclick={() => void follows.refresh()}>フォロー情報を再取得</button>
    {:else if following}
      <button
        class="following"
        disabled={busy || blocked}
        aria-busy={busy}
        aria-label="フォロー解除"
        onclick={() => void follows.unfollow(hex)}
      >
        フォロー解除
      </button>
    {:else}
      <button
        class="primary"
        disabled={busy || blocked}
        aria-busy={busy}
        aria-label="フォローする"
        onclick={() => void follows.follow(hex)}
      >
        フォローする
      </button>
    {/if}

    {#if asking}
      <!-- The one case where combine writes a list it did not read first. The
           relays agreed there is none, but agreement is not proof. -->
      <div class="confirm" role="alert">
        <!-- One line: a newline inside Japanese text renders as a space. -->
        <p>フォローリストが見つかりませんでした。新しく作成すると、他のクライアントで登録済みのフォローが失われる可能性があります。</p>
        <div class="confirm-actions">
          <button class="primary" onclick={() => void follows.confirmBootstrap()}>
            作成してフォロー
          </button>
          <button onclick={() => follows.cancelBootstrap()}>やめる</button>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .follow {
    display: contents;
  }

  /* Undoing a follow is the destructive direction. */
  .following:hover:not(:disabled) {
    border-color: var(--danger);
    color: var(--danger);
  }

  /* Disabled only to keep one change in flight at a time. Dimming it would
     undo the point: the new label is meant to read as already done. */
  .follow button[aria-busy='true'] {
    opacity: 1;
  }

  .confirm {
    /* Last on the row: otherwise the icons after the follow button are pushed
       below the panel and read as part of the warning. */
    order: 1;
    flex-basis: 100%;
    border: 1px solid var(--danger);
    border-radius: 6px;
    padding: 0.6rem 0.75rem;
    background: var(--bg-subtle);
  }

  .confirm p {
    margin: 0 0 0.6rem;
    font-size: 0.85rem;
    color: var(--text);
  }

  .confirm-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
</style>
