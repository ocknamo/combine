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
 * Opts the element into logging in through the host's `window.nostr` when it has
 * no account of its own to restore. Without it the user taps through eHagaki's
 * login dialog on the first visit and after every account switch.
 *
 * Upstream leaves it off because `getPublicKey()` usually prompts; here it
 * cannot — the shim answers from a session that is already signed in.
 *
 * An attribute rather than the `autoLogin` property, so an older cached bundle
 * ignores it instead of breaking.
 */
export const EHAGAKI_AUTO_LOGIN_ATTRIBUTE = 'auto-login';

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

/**
 * One relay in eHagaki's mount-scoped Relay Config (the `relays` property).
 *
 * Both flags are required and at least one has to be true: the element
 * validates the array as a whole and refuses all of it — with an
 * `initialization_failed` — rather than dropping the entry it dislikes.
 */
export interface ComposerRelayEntry {
  url: string;
  read: boolean;
  write: boolean;
}

/**
 * The Relay Config to give the composer: the page's in-browser relay, or none.
 *
 * Pointing the editor at nostr-cache's one intercept URL is the same trade the
 * views and `publishOwn.ts` already make (see `pickViewRelays` and
 * `publishTargets`). What eHagaki reads — the profile it shows, the reply and
 * quote previews, its own post history — comes out of the IndexedDB the
 * timeline reads through, instead of a second set of connections that cache
 * nothing. What it posts is stored by that relay and forwarded upstream by it,
 * so a new post is on combine's timeline without waiting for a relay to send it
 * back.
 *
 * `read` and `write` on the same entry, because a read-only config is not
 * "post the way you used to": it is `no_write_relays` on every post.
 *
 * `null` when no relay is running. Then eHagaki resolves relays for itself off
 * kind 10002, which is what it did before this property existed — a better
 * fallback than combine's own list, which is the user's *read* relays and turns
 * into `DEFAULT_RELAYS` (`relays.ts`) whenever the signer has nothing to say.
 */
export function composerRelays(interceptUrl: string | null): ComposerRelayEntry[] | null {
  return interceptUrl ? [{ url: interceptUrl, read: true, write: true }] : null;
}

export interface EhagakiComposerElement extends HTMLElement {
  assetBase: string | null;
  /**
   * This mount's Relay Config, which replaces eHagaki's own relay resolution
   * for the life of the element — it never reads kind 10002 and never stores
   * this. Has to be set before the element is connected, and a later change
   * only takes effect on a new element, so combine rebuilds instead (see
   * `ComposeView.svelte`).
   *
   * Optional because only the Full distribution defines it: on a cached older
   * bundle the assignment is an inert own property and eHagaki goes back to
   * resolving its own relays, which is the same graceful loss `auto-login`
   * takes.
   */
  relays?: readonly ComposerRelayEntry[];
  /**
   * Resolves once mounted; rejects on a failed init or an early disconnect.
   * With `auto-login`, not until the login attempt has settled.
   */
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
 * Build the element. All three have to be set before it is connected: the Web
 * Component entry opts out of the standalone build's "assets sit next to the
 * document" default, which would look for them on combine's origin; the login
 * attempt happens as part of the mount; and the Relay Config is read once, when
 * the element connects.
 */
export function createComposer(
  relays: readonly ComposerRelayEntry[] | null = null,
  doc: Pick<Document, 'createElement'> = document
): EhagakiComposerElement {
  const element = doc.createElement(EHAGAKI_TAG) as EhagakiComposerElement;
  element.assetBase = EHAGAKI_ASSET_BASE;
  element.setAttribute(EHAGAKI_AUTO_LOGIN_ATTRIBUTE, '');
  // Only when there is one to set. `null` does not read as "no config" — the
  // setter validates it like any other value, and the element comes up as a
  // failed init instead of falling back to its own relays. Leaving the property
  // alone is what asks for that fallback.
  if (relays) element.relays = relays;
  return element;
}

/**
 * The mascot's three colours, in combine's palette.
 *
 * Everything else combine themes goes through the `--ehagaki-*` tokens
 * (`ComposeView.svelte`) or through eHagaki's own variables set on the element
 * (`app.css`). The mascot takes neither: its colours are written onto the SVG
 * as `fill` presentation attributes, and the branch that would read them from
 * variables is gated on a class the element only gets in the standalone build
 * — so in the embed it is always eHagaki's green. A CSS `fill` beats a
 * presentation attribute, which makes a rule inside the shadow root the only
 * way to reach it.
 *
 * The face reads `--ehagaki-text`, not `--text`: `--text` is one of the names
 * eHagaki defines on its own `:host`, so inside the shadow tree that name is
 * eHagaki's. `--ehagaki-text` is combine's value on its way in, and no rule in
 * there redefines it. `--gold` and `--bg-subtle` collide with nothing.
 */
export const COMPOSER_SHADOW_CSS = `
[data-mascot-part='outer'] { fill: var(--gold); }
[data-mascot-part='inner'] { fill: var(--bg-subtle); }
[data-mascot-part='face'] { fill: var(--ehagaki-text); }
`;

/**
 * Adopt {@link COMPOSER_SHADOW_CSS} into the element's shadow root.
 *
 * Worth calling as soon as the element is connected — the shadow root is
 * attached synchronously there, so the mascot is combine's colour before the
 * editor's first paint. An adopted sheet rather than an appended `<style>`
 * because the element replaces its shadow children when it mounts, and because
 * appending one would wake the observer it keeps on that subtree.
 *
 * `false` means there was nothing to adopt into, which leaves the mascot green.
 * That is a cosmetic loss, not a broken editor, so nothing retries it.
 */
export function applyComposerTheme(element: EhagakiComposerElement): boolean {
  const root = element.shadowRoot;
  if (!root) return false;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(COMPOSER_SHADOW_CSS);
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  return true;
}

/**
 * The editor's text box, inside the element's shadow root.
 *
 * There is no focus API to ask instead — neither the Web Component nor the
 * standalone build has one — so this reaches into upstream's own DOM, which is
 * private and can be renamed out from under it. `[data-post-editor-root]` is
 * the steadiest handle on offer: eHagaki matches on that same attribute
 * internally to decide whether the editor holds focus.
 *
 * `null` when the editor is not up: before the bundle has loaded, and while
 * the element is showing its own login or error screen instead.
 */
export function composerEditor(element: EhagakiComposerElement): HTMLElement | null {
  return (
    element.shadowRoot?.querySelector<HTMLElement>(
      "[data-post-editor-root] [contenteditable='true']"
    ) ?? null
  );
}

/** Put the caret in the editor. `false` when there is no editor to put it in. */
export function focusComposerEditor(element: EhagakiComposerElement): boolean {
  const editor = composerEditor(element);
  if (!editor) return false;
  editor.focus();
  return true;
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
 * The part of Android Chrome's VirtualKeyboard API combine reads.
 *
 * It only reports anything once the page has opted into "the keyboard overlays
 * the content", and combine never asks for that — **eHagaki does**, from inside
 * the composer (`navigator.virtualKeyboard.overlaysContent = true` on Android
 * Chrome, at mount). That opt-in is also what stops the keyboard from shrinking
 * `visualViewport`, so on that browser this is the only thing left that knows
 * where the keyboard is. See `composerHeight`.
 */
export interface VirtualKeyboardLike {
  /**
   * The keyboard's rectangle, all zeros when hidden. Documented as client
   * coordinates, but only its height is trusted here (see `composerHeight`).
   */
  boundingRect: DOMRectReadOnly;
  addEventListener(type: 'geometrychange', listener: () => void): void;
  removeEventListener(type: 'geometrychange', listener: () => void): void;
}

/** `navigator.virtualKeyboard`, which only Chromium has. */
export function virtualKeyboard(): VirtualKeyboardLike | null {
  const nav = navigator as Navigator & { virtualKeyboard?: VirtualKeyboardLike };
  return nav.virtualKeyboard ?? null;
}

export interface ComposerHeightInput {
  /** Top of the host box, in layout-viewport coordinates. */
  hostTop: number;
  /** Height the host box has in the page's own layout. */
  hostHeight: number;
  /**
   * `window.innerHeight`. The layout viewport is the space `hostTop` is
   * measured in, and the box a docked keyboard eats into from the bottom.
   */
  layoutHeight: number;
  /** `visualViewport`'s offset and height, or `null` where it is missing. */
  viewport: { offsetTop: number; height: number } | null;
  /**
   * How tall `navigator.virtualKeyboard.boundingRect` says the keyboard is.
   * Zero means "no keyboard, or nothing is telling us". Only the height is
   * read, deliberately — see `composerHeight`.
   */
  keyboard: { height: number } | null;
}

/**
 * The height to give the element.
 *
 * It needs a definite one — `auto` is unsupported — and combine wants that to
 * follow the viewport. The host box already does (it is the flex remainder
 * between the header and the tab bar), so the height is its measured one,
 * capped so the element's bottom never falls below what is actually visible.
 * Otherwise the editor's footer — the post button — sits under the keyboard.
 *
 * Where the visible bottom comes from is the whole difficulty, and it differs
 * by browser, so both signals are read and the lower bottom wins:
 *
 * - **Android Chrome**: the keyboard's own geometry. eHagaki sets
 *   `navigator.virtualKeyboard.overlaysContent = true` when the composer
 *   mounts, which tells the browser not to resize anything for the keyboard —
 *   so `visualViewport` keeps reporting the full height and there is nothing to
 *   subtract. This is why the editor stayed full height there: the signal
 *   combine was watching had been switched off by the thing it embeds.
 * - **iOS Safari and the rest**: `visualViewport`, which does shrink. Also the
 *   Android case before the composer has mounted, when the opt-in has not
 *   happened yet and the keyboard still resizes the visual viewport.
 *
 * **Only the keyboard's height is read, never the `top` of its rectangle**,
 * although that is the very edge being looked for. A `top` is worth nothing
 * unless the rectangle is in the host box's coordinate space, and on the
 * device that reported this it is not: the editor came back exactly
 * `MIN_COMPOSER_HEIGHT` tall (240 CSS px measured off the screenshot) where 371
 * were free above the keyboard, so the bottom it was handed sat at least 130px
 * too high — not a rounding error, a different origin. A height has no origin
 * to disagree about, and a keyboard is docked flush with the bottom of the
 * layout viewport, so `innerHeight - height` reconstructs its top in our own
 * coordinates. It is what eHagaki computes for itself internally, from the same
 * two numbers.
 *
 * That also makes the result immune to the page scrolling under an open
 * keyboard: the keyboard does not move with the document, and now neither does
 * the bottom derived from it.
 */
export function composerHeight({
  hostTop,
  hostHeight,
  layoutHeight,
  viewport,
  keyboard,
}: ComposerHeightInput): number {
  const bottoms: number[] = [];
  if (viewport) bottoms.push(viewport.offsetTop + viewport.height);
  // A keyboard taller than the viewport it is docked in is not a keyboard;
  // whatever that rectangle means, subtracting it would leave nothing.
  if (keyboard && keyboard.height > 0 && keyboard.height < layoutHeight) {
    bottoms.push(layoutHeight - keyboard.height);
  }
  const visible = bottoms.length === 0 ? hostHeight : Math.min(...bottoms) - hostTop;
  return Math.max(Math.min(hostHeight, visible), MIN_COMPOSER_HEIGHT);
}
