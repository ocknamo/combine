<script lang="ts">
/**
 * The follow button on a person's page.
 *
 * Deliberately dumb: which state is safe to be in belongs to `follows`, because
 * every one of those states exists to stop a contact list being overwritten
 * with less than it had. This renders whichever one the store is in.
 */
import { auth } from '../auth.svelte';
import { follows } from '../follows.svelte';

let { hex }: { hex: string } = $props();

// One's own page has no follow button, and a logged-out visitor has nothing to
// follow with — the page still reads fine without one.
const shown = $derived(auth.loggedIn && hex !== auth.pubkey);

// Only for display. Every change re-reads the list from the relays first, so
// this being a few minutes old costs nothing but a briefly wrong label.
$effect(() => {
  if (shown) void follows.ensureLoaded();
});

const following = $derived(follows.isFollowing(hex));
const busy = $derived(follows.pending === hex);
// A contact list is replaced whole, so two changes at once would have the
// second undo the first — including one started from another person's page.
const blocked = $derived(follows.pending !== null && !busy);
const asking = $derived(follows.needsBootstrap === hex);
</script>

{#if shown}
  <div class="follow">
    {#if follows.status === 'loading'}
      <button disabled>読み込み中…</button>
    {:else if follows.status === 'unavailable'}
      <!-- Not a disabled follow button: the list could not be read, and a
           button that looks pressable here would publish over follows we never
           saw. Offer the retry instead. -->
      <button onclick={() => void follows.refresh()}>フォロー情報を再取得</button>
    {:else if following}
      <button class="following" disabled={busy || blocked} onclick={() => void follows.unfollow(hex)}>
        {busy ? '解除中…' : 'フォロー中'}
      </button>
    {:else}
      <button class="primary" disabled={busy || blocked} onclick={() => void follows.follow(hex)}>
        {busy ? '送信中…' : 'フォロー'}
      </button>
    {/if}

    {#if asking}
      <!-- The one case where combine writes a contact list it did not read
           first. The relays agreed there is none, but "agreed" is not proof,
           so the decision is the user's and the warning says what it costs. -->
      <div class="confirm" role="alert">
        <!-- One line on purpose: a newline inside Japanese text renders as a
             space between the characters it falls between. -->
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

  /* Reads as "you follow this person", and as a button that undoes it on
     hover — the label swap is the only affordance a single button has. */
  .following:hover:not(:disabled) {
    border-color: var(--danger);
    color: var(--danger);
  }

  .confirm {
    /* Last on the row whatever it sits next to: the panel takes a line of its
       own, and without this the icons after the follow button are pushed below
       it and read as part of the warning. */
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
