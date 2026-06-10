<script lang="ts">
import { onDestroy, onMount } from 'svelte';
import { auth } from '../auth.svelte';
import { buildEhagakiUrl, createEhagakiBridge, type EhagakiBridge } from '../ehagaki';
import { router } from '../router.svelte';
import { toast } from '../toast.svelte';

let iframeEl = $state<HTMLIFrameElement | null>(null);
let bridge: EhagakiBridge | null = null;
let lastNotifiedPubkey: string | null = null;

let targetKind = $state<'reply' | 'quote'>('reply');
let targetId = $state('');
let contextLabel = $state<string | null>(null);

const src = buildEhagakiUrl(location.origin);

onMount(() => {
  if (!iframeEl) return;
  bridge = createEhagakiBridge({
    iframe: iframeEl,
    getPubkey: () => auth.pubkey,
    signEvent: (event) => auth.signEvent(event as unknown as Parameters<typeof auth.signEvent>[0]),
    onPostSuccess: () => {
      toast.show('投稿しました');
      clearContext();
      router.go('/');
    },
    onPostError: (payload) => {
      if (payload.code !== 'empty_content') {
        toast.show(`投稿に失敗しました: ${payload.message}`, 'error');
      }
    },
  });
});

onDestroy(() => {
  bridge?.destroy();
  bridge = null;
});

// Tell eHagaki when login state changes after the iframe is already up.
$effect(() => {
  const pubkey = auth.pubkey;
  if (!bridge) return;
  if (pubkey && pubkey !== lastNotifiedPubkey) {
    bridge.notifyLogin(pubkey);
  } else if (!pubkey && lastNotifiedPubkey) {
    bridge.notifyLogout();
  }
  lastNotifiedPubkey = pubkey;
});

function applyContext(event: SubmitEvent) {
  event.preventDefault();
  const id = targetId.trim();
  if (!bridge || !/^(note1|nevent1)/i.test(id)) return;
  if (targetKind === 'reply') {
    bridge.setContext({ reply: id, quotes: [] });
    contextLabel = `返信先: ${id.slice(0, 16)}…`;
  } else {
    bridge.setContext({ reply: null, quotes: [id] });
    contextLabel = `引用: ${id.slice(0, 16)}…`;
  }
}

function clearContext() {
  targetId = '';
  contextLabel = null;
  bridge?.setContext({ reply: null, quotes: [] });
}
</script>

<section>
  {#if !auth.loggedIn}
    <p class="notice">
      投稿するには<button class="link" onclick={() => auth.login()}>ログイン</button>してください。
    </p>
  {/if}

  <details>
    <summary>返信・引用先を設定</summary>
    <form onsubmit={applyContext}>
      <div class="mode" role="radiogroup" aria-label="返信か引用か">
        <label><input type="radio" bind:group={targetKind} value="reply" /> 返信</label>
        <label><input type="radio" bind:group={targetKind} value="quote" /> 引用</label>
      </div>
      <input type="text" bind:value={targetId} placeholder="note1… または nevent1…" aria-label="対象のノートID" />
      <div class="actions">
        <button type="submit" class="primary" disabled={!/^(note1|nevent1)/i.test(targetId.trim())}>適用</button>
        <button type="button" onclick={clearContext}>クリア</button>
      </div>
    </form>
  </details>

  {#if contextLabel}
    <p class="context">{contextLabel}</p>
  {/if}

  <iframe
    bind:this={iframeEl}
    {src}
    title="eHagaki 投稿エディタ"
    allow="local-network-access; local-network; loopback-network"
  ></iframe>

  <p class="credit">
    投稿エディタは <a href="https://lokuyow.github.io/ehagaki/" target="_blank" rel="noreferrer">eHagaki</a>
    を埋め込んでいます。署名はパスキー（Nosskey）で行われます。
  </p>
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .notice {
    margin: 0;
    padding: 0.6rem 1rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-subtle);
  }

  .link {
    border: none;
    background: none;
    color: var(--gold-strong);
    text-decoration: underline;
    padding: 0 0.15rem;
  }

  details {
    border-bottom: 1px solid var(--border);
    padding: 0.5rem 1rem;
  }

  summary {
    cursor: pointer;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.6rem 0;
  }

  .mode {
    display: flex;
    gap: 1.25rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .context {
    margin: 0;
    padding: 0.4rem 1rem;
    font-size: 0.85rem;
    color: var(--olive);
    border-bottom: 1px solid var(--border);
    font-family: var(--mono);
  }

  iframe {
    border: none;
    width: 100%;
    flex: 1;
    min-height: 480px;
  }

  .credit {
    margin: 0;
    padding: 0.4rem 1rem calc(0.4rem + env(safe-area-inset-bottom));
    font-size: 0.75rem;
    color: var(--text-muted);
    border-top: 1px solid var(--border);
  }
</style>
