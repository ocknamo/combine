<script lang="ts">
/**
 * The post editor: eHagaki's `<ehagaki-composer>` Web Component.
 *
 * The element is created by hand rather than written into the markup, because
 * when to create it is the whole point. It pulls in a few megabytes of editor
 * and mounts it on combine's main thread, so it is built the first time the
 * user opens this tab — and kept from then on, since a second visit should not
 * pay for that again. `active` is what tells it that moment has come; the view
 * itself stays mounted for the app's lifetime (see `App.svelte`).
 */
import { auth } from '../auth.svelte';
import {
  clearEhagakiStorage,
  composerHeight,
  createComposer,
  EHAGAKI_SETTINGS,
  EHAGAKI_SITE_URL,
  type EhagakiComposerElement,
  INIT_ERROR_EVENT,
  loadEhagakiComposer,
  POST_ERROR_EVENT,
  POST_SUCCESS_EVENT,
  type PostErrorDetail,
  postErrorMessage,
} from '../ehagakiComposer';
import { router } from '../router.svelte';
import { toast } from '../toast.svelte';
import LoginGate from './LoginGate.svelte';

let { active = false }: { active?: boolean } = $props();

let hostEl = $state<HTMLDivElement | null>(null);
let status = $state<'idle' | 'loading' | 'ready' | 'failed'>('idle');

let composer: EhagakiComposerElement | null = null;
let mounting = false;
/** The account the live element was built for. */
let builtFor: string | null = null;
/** Set while the element is still coming up, and applied once it is ready. */
let pendingContext: { reply: string | null; quotes: string[] } | null = null;

let targetKind = $state<'reply' | 'quote'>('reply');
let targetId = $state('');
let contextLabel = $state<string | null>(null);

async function mountComposer(): Promise<void> {
  if (composer || mounting || !hostEl) return;
  mounting = true;
  status = 'loading';
  try {
    await loadEhagakiComposer();
    // The teardown path runs while this is in flight if the user logs out.
    const host = hostEl;
    if (!host) return;
    const element = createComposer();
    host.appendChild(element);
    composer = element;
    builtFor = auth.pubkey;
    applyHeight();
    await element.whenReady();
    await element.setSettings(EHAGAKI_SETTINGS);
    status = 'ready';
    if (pendingContext) {
      const context = pendingContext;
      pendingContext = null;
      await element.setContext(context);
    }
  } catch {
    // Every failure here is the same to the user: no editor. The credit line
    // below links to eHagaki itself, which is the only other way to post.
    teardown();
    status = 'failed';
  } finally {
    mounting = false;
  }
}

function teardown(): void {
  composer?.remove();
  composer = null;
  builtFor = null;
  pendingContext = null;
  contextLabel = null;
  status = 'idle';
}

function applyHeight(): void {
  if (!composer || !hostEl) return;
  const rect = hostEl.getBoundingClientRect();
  const viewport = window.visualViewport;
  const height = composerHeight({
    hostTop: rect.top,
    hostHeight: rect.height,
    viewport: viewport ? { offsetTop: viewport.offsetTop, height: viewport.height } : null,
  });
  composer.style.height = `${height}px`;
}

// Build it once this tab is opened, and rebuild it when the account changes:
// eHagaki decides who is signed in from its own storage, so an element built
// for the previous account would go on posting as them.
$effect(() => {
  const pubkey = auth.pubkey;
  const shouldMount = active && pubkey !== null && hostEl !== null;
  if (composer && builtFor !== pubkey) teardown();
  if (shouldMount) void mountComposer();
});

// Logging out has to take the composer's storage with it — its draft and the
// account it believes it is signed in as are on combine's origin now, so
// otherwise the next person on this device inherits both.
let lastPubkey: string | null = auth.pubkey;
$effect(() => {
  const pubkey = auth.pubkey;
  const loggedOut = lastPubkey !== null && pubkey === null;
  lastPubkey = pubkey;
  if (loggedOut) clearEhagakiStorage();
});

// The element's events bubble and are composed, so one listener per event on
// the host covers it wherever it is in the shadow tree.
$effect(() => {
  const host = hostEl;
  if (!host) return;

  const onSuccess = () => {
    toast.show('投稿しました');
    clearContext();
    router.go('/');
  };
  const onError = (event: Event) => {
    const detail = (event as CustomEvent<PostErrorDetail>).detail;
    const message = postErrorMessage(detail?.code ?? 'post_failed');
    if (message) toast.show(message, 'error');
  };
  const onInitError = () => {
    teardown();
    status = 'failed';
  };

  host.addEventListener(POST_SUCCESS_EVENT, onSuccess);
  host.addEventListener(POST_ERROR_EVENT, onError);
  host.addEventListener(INIT_ERROR_EVENT, onInitError);
  return () => {
    host.removeEventListener(POST_SUCCESS_EVENT, onSuccess);
    host.removeEventListener(POST_ERROR_EVENT, onError);
    host.removeEventListener(INIT_ERROR_EVENT, onInitError);
  };
});

// The host box follows the viewport, and the element's height is copied from
// it. `visualViewport` is watched as well for the case the box cannot see: the
// software keyboard on iOS, which shrinks what is visible without resizing the
// page (see `composerHeight`).
$effect(() => {
  const host = hostEl;
  if (!host) return;
  const observer = new ResizeObserver(applyHeight);
  observer.observe(host);
  const viewport = window.visualViewport;
  viewport?.addEventListener('resize', applyHeight);
  viewport?.addEventListener('scroll', applyHeight);
  return () => {
    observer.disconnect();
    viewport?.removeEventListener('resize', applyHeight);
    viewport?.removeEventListener('scroll', applyHeight);
  };
});

function applyContext(event: SubmitEvent) {
  event.preventDefault();
  const id = targetId.trim();
  if (!/^(note1|nevent1)/i.test(id)) return;
  const context =
    targetKind === 'reply' ? { reply: id, quotes: [] } : { reply: null, quotes: [id] };
  setContext(context);
  contextLabel = `${targetKind === 'reply' ? '返信先' : '引用'}: ${id.slice(0, 16)}…`;
}

function clearContext() {
  targetId = '';
  contextLabel = null;
  setContext({ reply: null, quotes: [] });
}

/** Hand the context over, or hold it until the element is ready to take it. */
function setContext(context: { reply: string | null; quotes: string[] }): void {
  if (status !== 'ready' || !composer) {
    pendingContext = context;
    return;
  }
  composer.setContext(context).catch(() => {
    toast.show('返信・引用先を設定できませんでした', 'error');
  });
}
</script>

<section>
  {#if !auth.loggedIn}
    <LoginGate message="投稿するにはログインが必要です。" />
  {:else}
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

    {#if status === 'loading'}
      <p class="state">エディタを読み込み中…</p>
    {:else if status === 'failed'}
      <p class="state">
        エディタを読み込めませんでした。
        <a href={EHAGAKI_SITE_URL} target="_blank" rel="noreferrer">eHagaki</a>
        に接続できない可能性があります。
      </p>
    {/if}

    <!-- The element is appended here by mountComposer; nothing else goes in. -->
    <div class="composer" bind:this={hostEl}></div>

    <p class="credit">
      投稿エディタは <a href={EHAGAKI_SITE_URL} target="_blank" rel="noreferrer">eHagaki</a>
      を埋め込んでいます。署名はパスキー（Nosskey）で行われます。
    </p>
  {/if}
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
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

  /*
    The room left between the header and the tab bar, which is what the element
    is sized to. `min-height: 0` keeps it from growing past the flex line, so
    the height it reports back stays the height it was given.

    The `--ehagaki-*` tokens are set here rather than on the element: custom
    properties inherit, and the element is not in this markup for Svelte's
    scoped CSS to reach.
  */
  .composer {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    --ehagaki-accent-color: var(--gold);
    --ehagaki-base-color: var(--bg-subtle);
    --ehagaki-background: var(--bg);
    --ehagaki-text: var(--text);
    --ehagaki-border: var(--border);
    --ehagaki-link: var(--gold-strong);
    --ehagaki-input-background: var(--bg);
    --ehagaki-footer-background: var(--bg-subtle);
    --ehagaki-dialog-background: var(--bg);
    --ehagaki-font-family: var(--sans);
  }

  .state {
    margin: 0;
    padding: 0.6rem 1rem;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .credit {
    margin: 0;
    padding: 0.4rem 1rem calc(0.4rem + env(safe-area-inset-bottom));
    font-size: 0.75rem;
    color: var(--text-muted);
    border-top: 1px solid var(--border);
  }
</style>
