<script lang="ts">
import { auth } from '../auth.svelte';
import { toHexPubkey, toNpub } from '../nip19';
import { userPath } from '../postRef';
import { appUrl, shareLink } from '../share';
import { toast } from '../toast.svelte';
import BackBar from './BackBar.svelte';
import LoginGate from './LoginGate.svelte';
import ProfileCard from './ProfileCard.svelte';
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

// The page as someone outside the app can open it: the deployment's own URL
// (which carries the base path) with this person's hash route on the end.
const shareUrl = $derived(npub ? appUrl(userPath(npub)) : null);

async function copyNpub() {
  if (!npub) return;
  await navigator.clipboard.writeText(npub);
  toast.show('npub をコピーしました');
}

async function shareProfile() {
  if (shareUrl) await shareLink(shareUrl);
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
    <ProfileCard user={hex} display="card" nolink theme="light" />

    <div class="meta">
      <!-- Two deliberate rows: who this is (the npub, and copying it), then what
           can be done from here. Left to wrap on its own the split would land
           wherever the viewport put it. -->
      {#if npub}
        <div class="row">
          <code>{npub.slice(0, 20)}…{npub.slice(-6)}</code>
          <!-- Icon-only: the label lives in `aria-label` for assistive tech and
               in `title` as the hover tooltip that replaces the removed caption. -->
          <button class="icon" onclick={copyNpub} aria-label="npub をコピー" title="npub をコピー">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" /></svg>
          </button>
        </div>
      {/if}
      <div class="row">
        {#if npub}
          <button class="icon" onclick={shareProfile} aria-label="共有" title="共有">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z" /></svg>
          </button>
        {/if}
        <!-- Whose profile this is, not which route reached it: the account
             actions belong on one's own page either way. -->
        {#if isSelf}
          <a
            class="button-like icon"
            href="https://nosskey.app"
            target="_blank"
            rel="noreferrer"
            aria-label="鍵の管理"
            title="鍵の管理"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" /></svg>
          </a>
          <!-- The one action that keeps its caption: logging out is destructive
               enough that it should not hide behind a glyph. -->
          <button onclick={() => auth.logout()}>ログアウト</button>
        {/if}
      </div>
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
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
  }

  /* Each row still wraps on its own, so a narrow viewport breaks it further
     rather than overflowing. */
  .row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
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

  /* Square enough to stay a comfortable tap target once the caption is gone. */
  .icon {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.45rem;
    color: var(--text-muted);
  }

  .icon:hover {
    color: var(--gold-strong);
  }

  /* Material icons are solid shapes, unlike the stroked glyphs the tab bar
     draws by hand, so they take currentColor as a fill. */
  .icon svg {
    width: 22px;
    height: 22px;
    fill: currentColor;
  }

  h2 {
    font-size: 1rem;
    margin: 0.75rem 1rem 0.25rem;
    color: var(--gold-strong);
  }
</style>
