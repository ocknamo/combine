<script lang="ts">
import { auth } from '../auth.svelte';
import { cacheRelay } from '../cacheRelay.svelte';
import { toHexPubkey, toNpub } from '../nip19';
import { userPath } from '../postRef';
import { toast } from '../toast.svelte';
import { truncateName } from '../truncateName';
import BackBar from './BackBar.svelte';
import LoginGate from './LoginGate.svelte';
import TimelineEmbed from './TimelineEmbed.svelte';

/**
 * A person's page. Both the profile tab and `#/user/…` are this component —
 * they differ in how the user got here, not in whose profile it is.
 */
let {
  user = null,
  /** Mounted as the profile tab rather than drilled into from a card. */
  tab = false,
}: { user?: string | null; tab?: boolean } = $props();

const hex = $derived(user ? toHexPubkey(user) : null);
const npub = $derived(hex ? toNpub(hex) : null);

// Tapping one's own avatar in a timeline lands on `#/user/<自分>`, which is
// this same page — so whose profile it is has to be read from the pubkey, not
// from the route that reached it.
const isSelf = $derived(hex !== null && hex === auth.pubkey);

// `nostr-profile` ignores a changed `relays`, so it is keyed on the connection
// target and rebuilt when it moves.
const relayKey = $derived(cacheRelay.viewRelays.join(','));

// The page as someone outside the app can open it: the deployment's own URL
// (which carries the base path) with this person's hash route on the end.
const shareUrl = $derived(npub ? `${location.origin}${location.pathname}#${userPath(npub)}` : null);

async function copyNpub() {
  if (!npub) return;
  await navigator.clipboard.writeText(npub);
  toast.show('npub をコピーしました');
}

/**
 * Hand the page's URL to the OS share sheet, or to the clipboard where there is
 * none. A share the user dismissed is not a failure and must not fall back —
 * copying something they just declined to send is the one outcome they did not
 * ask for.
 */
async function shareProfile() {
  if (!shareUrl) return;
  if (navigator.share) {
    try {
      await navigator.share({ url: shareUrl });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
  }
  await navigator.clipboard.writeText(shareUrl);
  toast.show('リンクをコピーしました');
}
</script>

<section>
  <!-- Only when drilled into: the tab bar has an entry for one's own profile,
       but none for anybody else's, so this is the way back from there. The
       label is where the page says whose it is, which is the only cue there is
       for one's own profile reached this way. -->
  {#if !tab}
    <BackBar label={isSelf ? 'あなた' : 'ユーザー'} />
  {/if}

  {#if tab && !auth.loggedIn}
    <LoginGate message="プロフィールを表示するにはログインが必要です。" />
  {:else if !hex}
    <p class="empty">ユーザーが見つかりませんでした。</p>
  {:else}
    {#if cacheRelay.resolved}
      {#key relayKey}
        <nostr-profile use:truncateName={'card'} user={hex} relays={cacheRelay.viewRelays} display="card" nolink="true" theme="light"></nostr-profile>
      {/key}
    {/if}

    <div class="meta">
      {#if npub}
        <code>{npub.slice(0, 20)}…{npub.slice(-6)}</code>
        <button onclick={copyNpub}>コピー</button>
        <button onclick={shareProfile}>共有</button>
      {/if}
      <!-- Whose profile this is, not which route reached it: the account
           actions belong on one's own page either way. -->
      {#if isSelf}
        <a class="button-like" href="https://nosskey.app" target="_blank" rel="noreferrer">鍵の管理</a>
        <button onclick={() => auth.logout()}>ログアウト</button>
      {/if}
    </div>

    <h2>投稿</h2>
    <TimelineEmbed filters={[{ kinds: [1], authors: [hex], limit: 30 }]} />
  {/if}
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
  }

  .meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
  }

  code {
    font-family: var(--mono);
    font-size: 0.8rem;
    color: var(--text-muted);
    background: var(--bg-subtle);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
  }

  .button-like {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.45rem 1rem;
    color: var(--text);
  }

  .button-like:hover {
    background: var(--bg-subtle);
    text-decoration: none;
  }

  h2 {
    font-size: 1rem;
    margin: 0.75rem 1rem 0.25rem;
    color: var(--gold-strong);
  }

  .empty {
    text-align: center;
    color: var(--text-muted);
    padding: 2rem 1rem;
  }
</style>
