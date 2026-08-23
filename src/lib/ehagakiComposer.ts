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

/**
 * Events combine listens for. They bubble and are composed, so a listener on
 * the host element sees them. The element dispatches `ehagaki-ready` as well,
 * which is not here: `whenReady()` says the same thing and can be awaited in
 * the order the rest of the setup runs in.
 */
export const POST_SUCCESS_EVENT = 'ehagaki-post-success';
export const POST_ERROR_EVENT = 'ehagaki-post-error';
export const INIT_ERROR_EVENT = 'ehagaki-initialization-error';

/** Note there is no `message`: the iframe protocol carried one, this does not. */
export interface PostErrorDetail {
  code: string;
}

/** What `ehagaki-initialization-error` carries. */
export interface InitErrorDetail {
  code: string;
  message?: string;
}

/**
 * Why a mount failed, short enough to put on screen.
 *
 * Worth showing rather than hiding behind one sentence: the failures look
 * nothing alike from here — the bundle not loading, the editor failing to come
 * up, the element being torn down mid-mount — and only the first one is the
 * "cannot reach eHagaki" that a single message would claim. The element's own
 * errors are `Error`s carrying the code in `name` (`initialization_failed`,
 * `multiple_instances_unsupported`, `disconnected`).
 */
export function describeFailure(error: unknown): string {
  if (error instanceof Error) {
    return error.name && error.name !== 'Error' ? `${error.name}: ${error.message}` : error.message;
  }
  return String(error);
}

/**
 * Whether the element was taken out of the document before it came up, which
 * `whenReady()` rejects with. Not the editor failing: something removed it —
 * an account change, or the signed-in branch of the view unmounting — and
 * whatever did that decides what comes next.
 */
export function isDisconnected(error: unknown): boolean {
  return error instanceof Error && error.name === 'disconnected';
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

/**
 * Where Dexie parks itself, which is also how it detects a second copy: the
 * first loader claims the slot, and a later one with a different version throws
 * instead of starting.
 */
const DEXIE_REGISTRY = Symbol.for('Dexie');

type SymbolBag = { [key: symbol]: unknown };

/**
 * Make the page's Dexie slot look empty to whoever reads it, until the returned
 * function puts back the claim that was there.
 *
 * nostr-cache and eHagaki each bundle their own Dexie — 4.4.4 and 4.4.2 — and
 * combine now runs both in one realm. Whichever loads second reads the other's
 * claim and throws "Two different versions of Dexie loaded in the same app";
 * when that is the composer, the editor never comes up. This could not happen
 * while eHagaki was an iframe: the two were in separate documents.
 *
 * Emptying the slot once is not enough, because which of the two gets there
 * first is a race — the relay bundle is fetched at startup, the composer's the
 * first time the tab is opened, and either can win. Reading empty for the whole
 * window is what makes the outcome the same every time: each copy registers
 * itself and compares against nothing.
 *
 * The check guards against bundling Dexie twice by accident, not against two
 * libraries each having their own: these two open separate databases
 * (`combine-timeline` and `eHagakiDB`) and share no connection. The first claim
 * is what gets restored, so a later loader is still compared against whoever
 * was here first.
 *
 * The real fix is one Dexie version across the two, upstream. This stops being
 * needed the day that lands, and does nothing in the meantime.
 */
export function shieldDexieRegistry(target: SymbolBag = globalThis as SymbolBag): () => void {
  const existing = Object.getOwnPropertyDescriptor(target, DEXIE_REGISTRY);
  let claimed = existing && 'value' in existing ? existing.value : undefined;
  try {
    Object.defineProperty(target, DEXIE_REGISTRY, {
      configurable: true,
      get: () => undefined,
      set: (value: unknown) => {
        if (claimed === undefined) claimed = value;
      },
    });
  } catch {
    // A slot that cannot be redefined is one combine has to live with: leave it
    // alone rather than half-shielded.
    return () => {};
  }
  return () => {
    delete target[DEXIE_REGISTRY];
    if (claimed !== undefined) target[DEXIE_REGISTRY] = claimed;
  };
}

/** Never shrink the editor past this, however little room is left. */
export const MIN_COMPOSER_HEIGHT = 240;

/**
 * How much of the layout viewport has to go missing before something is taken
 * to be covering the page.
 *
 * Browser chrome and the iOS accessory bar (an external keyboard's toolbar)
 * take tens of pixels; a software keyboard takes a third of the screen or more.
 * The gap between the two is wide enough that one number separates them.
 */
export const KEYBOARD_THRESHOLD = 120;

/** What `visualViewport` reports, or `null` where it is missing. */
export interface ViewportMetrics {
  /** Where the visible area starts, measured from the layout viewport's top. */
  offsetTop: number;
  height: number;
  /** Pinch-zoom factor: it shrinks the visible area the same way a keyboard does. */
  scale: number;
}

export interface ComposerBoxInput {
  /** The host box, in layout-viewport coordinates (`getBoundingClientRect`). */
  host: { top: number; left: number; width: number; height: number };
  viewport: ViewportMetrics | null;
  /** The layout viewport's height — what the software keyboard does not take. */
  layoutHeight: number;
}

/**
 * Where to put the element and how big to make it.
 *
 * `flow` leaves it where the markup puts it and only sets a height; `pinned`
 * takes it out of flow and fixes it over the visible area.
 */
export type ComposerBox =
  | { mode: 'flow'; height: number }
  | { mode: 'pinned'; top: number; left: number; width: number; height: number };

/**
 * Whether a software keyboard is up: the visible area is much shorter than the
 * layout viewport, and it is not zoom that made it so.
 */
function keyboardIsOpen(viewport: ViewportMetrics, layoutHeight: number): boolean {
  if (viewport.scale > 1.05) return false;
  return layoutHeight - viewport.height > KEYBOARD_THRESHOLD;
}

/**
 * The box to give the element. It needs a definite height — `auto` is
 * unsupported — and combine wants that to follow whatever is actually visible.
 *
 * With no keyboard, the host box already follows the viewport (it is the flex
 * remainder between the header and the tab bar), so the element is given its
 * height, capped at the visible bottom for the small bites browser chrome takes.
 *
 * With a keyboard up, that is not enough. combine's page is document-scrolling,
 * and both mobile browsers scroll it to reveal the caret when the keyboard
 * opens: the host box slides up under the header while the visible area shrinks
 * from the bottom, so the two no longer share a top edge and a height alone
 * cannot line the element up with what is on screen. Worse, the scroll happens
 * after the resize and fires no `visualViewport` event, so a height computed
 * from the old position is what stays. Both are why the footer — the post
 * button — ends up under the keyboard.
 *
 * So while the keyboard is up the element is pinned instead: fixed to the
 * visible rectangle (`top` is the visual viewport's own offset, since fixed
 * positioning is relative to the layout viewport), full height of it, keeping
 * the host box's horizontal placement. The editor goes full-screen over the
 * header and the tab bar for as long as the user is typing, which is the moment
 * neither of those is what they want to look at, and its footer sits exactly on
 * top of the keyboard.
 *
 * Pinned height is the visible height, with no minimum applied: padding it back
 * past the visible bottom would put the footer under the keyboard again, which
 * is the one thing this mode exists to prevent.
 */
export function composerBox({ host, viewport, layoutHeight }: ComposerBoxInput): ComposerBox {
  if (viewport && keyboardIsOpen(viewport, layoutHeight)) {
    return {
      mode: 'pinned',
      top: viewport.offsetTop,
      left: host.left,
      width: host.width,
      height: viewport.height,
    };
  }
  const visible = viewport ? viewport.offsetTop + viewport.height - host.top : host.height;
  return { mode: 'flow', height: Math.max(Math.min(host.height, visible), MIN_COMPOSER_HEIGHT) };
}
