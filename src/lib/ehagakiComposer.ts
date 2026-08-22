/**
 * Loader and types for the embedded eHagaki composer, the Web Component build.
 *
 * This replaces the iframe and its `ehagaki.embed` postMessage bridge. The
 * element runs in combine's own realm, so there is nothing to relay: it reads
 * the signer off `window.nostr` (see `nip07.ts`), stores its drafts and
 * settings under combine's origin, and inherits combine's CSS variables through
 * the `--ehagaki-*` tokens.
 *
 * The private key is still out of reach — it never leaves nosskey.app, which
 * gates every signature behind its own consent dialog. What does change is the
 * trust boundary: eHagaki's JS now shares this realm, so it can reach combine's
 * DOM, storage and the shim itself.
 *
 * The bundle is loaded from lokuyow.github.io rather than npm (there is no
 * package), which GitHub Pages serves with `access-control-allow-origin: *`.
 */

export const EHAGAKI_ORIGIN = 'https://lokuyow.github.io';
export const EHAGAKI_SITE_URL = `${EHAGAKI_ORIGIN}/ehagaki/`;

/**
 * Where the Web Component build lives. Also its `asset-base`: the entry only
 * re-exports from a chunk next to it, and icons, translations and the ffmpeg
 * worker are resolved against this directory.
 */
export const EHAGAKI_ASSET_BASE = `${EHAGAKI_ORIGIN}/ehagaki/web-component/`;
export const EHAGAKI_SCRIPT_URL = `${EHAGAKI_ASSET_BASE}ehagaki-composer.js`;
export const EHAGAKI_TAG = 'ehagaki-composer';

/**
 * Prefix eHagaki namespaces its `localStorage` keys under, on the host origin.
 * Its IndexedDB is `eHagakiDB`, which does not collide with combine's
 * `combine-timeline` (see `nostrCache.ts`).
 */
export const EHAGAKI_STORAGE_PREFIX = 'ehagaki.web-component.v1:';

/** Events the element dispatches. All of them bubble and are composed. */
export const READY_EVENT = 'ehagaki-ready';
export const POST_SUCCESS_EVENT = 'ehagaki-post-success';
export const POST_ERROR_EVENT = 'ehagaki-post-error';
export const INIT_ERROR_EVENT = 'ehagaki-initialization-error';

export interface PostSuccessDetail {
  eventId?: string;
  replyToEventId?: string;
  quotedEventIds?: string[];
}

/** Note there is no `message`: the iframe protocol carried one, this does not. */
export interface PostErrorDetail {
  code: string;
}

/** Partial by design — an omitted key is left alone, `null` clears it. */
export interface ComposerContext {
  content?: string | null;
  reply?: string | null;
  quotes?: string[] | null;
}

/** Only the settings combine sets; the element understands more. */
export interface ComposerSettings {
  locale?: 'ja' | 'en';
  themeMode?: 'system' | 'light' | 'dark';
  clientTagEnabled?: boolean;
}

export interface EhagakiComposerElement extends HTMLElement {
  assetBase: string | null;
  /** Resolves once mounted; rejects on a failed init or an early disconnect. */
  whenReady(): Promise<void>;
  /** Applied atomically: an unknown or invalid key rejects the whole payload. */
  setSettings(settings: ComposerSettings): Promise<readonly string[]>;
  setContext(context: ComposerContext): Promise<void>;
}

/**
 * What the iframe used to get through its query string (`defaultLocale=ja`,
 * `embedClientTag=true`). `light` because combine is a light-only theme
 * (`color-scheme: light` in `app.css`) — left on `system` the editor would go
 * dark inside a light page.
 */
export const EHAGAKI_SETTINGS: ComposerSettings = {
  locale: 'ja',
  themeMode: 'light',
  clientTagEnabled: true,
};

/**
 * A toast for a failed post, or `null` when the user should see nothing.
 *
 * `empty_content` is the "you pressed post on an empty editor" case, which
 * eHagaki already says in its own UI — a toast on top of that is noise.
 */
export function postErrorMessage(code: string): string | null {
  switch (code) {
    case 'empty_content':
      return null;
    case 'login_required':
      return '投稿するにはログインが必要です。';
    case 'nostr_not_ready':
      return '署名の準備ができていません。少し待ってからもう一度お試しください。';
    case 'post_failed':
      return '投稿に失敗しました。';
    default:
      return `投稿に失敗しました: ${code}`;
  }
}

let pending: Promise<void> | null = null;

/**
 * Import the bundle once and resolve when the element is defined. Concurrent
 * callers share the attempt; a failed load is not cached, so a later call can
 * retry.
 *
 * The URL is a runtime value on purpose (`@vite-ignore`): it points at another
 * origin and must not be pulled into combine's build. Importing it registers
 * the element itself — the module guards on `customElements.get` — and
 * `whenDefined` is what turns that into something to await.
 */
export function loadEhagakiComposer(): Promise<void> {
  if (pending) return pending;

  pending = (async () => {
    await import(/* @vite-ignore */ EHAGAKI_SCRIPT_URL);
    await customElements.whenDefined(EHAGAKI_TAG);
  })();

  pending.catch(() => {
    pending = null;
  });

  return pending;
}

/**
 * Build the element. `assetBase` has to be set before it is connected: the
 * Web Component entry opts out of the standalone build's "assets sit next to
 * the document" default, which would look for them on combine's origin.
 */
export function createComposer(): EhagakiComposerElement {
  const element = document.createElement(EHAGAKI_TAG) as EhagakiComposerElement;
  element.assetBase = EHAGAKI_ASSET_BASE;
  return element;
}

/**
 * Drop everything the composer has stored on this origin.
 *
 * For logout: the draft and the account eHagaki considers signed in now live in
 * combine's own `localStorage`, so without this the next person to open the app
 * on the device inherits both. It takes the editor's settings with it, which is
 * the cost of not leaving one user's half-written post for another.
 */
export function clearEhagakiStorage(storage: Storage = localStorage): void {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key?.startsWith(EHAGAKI_STORAGE_PREFIX)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}

/** Never shrink the editor past this, however little room is left. */
export const MIN_COMPOSER_HEIGHT = 240;

export interface ComposerHeightInput {
  /** Top of the host box, in layout-viewport coordinates. */
  hostTop: number;
  /** Height the host box has in the page's own layout. */
  hostHeight: number;
  /** `visualViewport`'s offset and height, or `null` where it is missing. */
  viewport: { offsetTop: number; height: number } | null;
}

/**
 * The height to give the element.
 *
 * It needs a definite one — `auto` is unsupported — and combine wants that to
 * follow the viewport. The host box already does (it is the flex remainder
 * between the header and the tab bar), so the height is its measured one,
 * except when the visual viewport is smaller than the layout viewport: that is
 * the software keyboard on iOS, which does not resize the page. Left at the
 * layout height there, the editor's footer — the post button — sits under the
 * keyboard. Capping at the visible bottom keeps it reachable.
 */
export function composerHeight({ hostTop, hostHeight, viewport }: ComposerHeightInput): number {
  const visible = viewport ? viewport.offsetTop + viewport.height - hostTop : hostHeight;
  return Math.max(Math.min(hostHeight, visible), MIN_COMPOSER_HEIGHT);
}
