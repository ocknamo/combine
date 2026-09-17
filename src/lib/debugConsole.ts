/**
 * `?debug=1` のときだけ出すオンページのログパネル。
 *
 * iPhone は DevTools を開けないため、これが無いと `console.error` が読めない。
 * nosskey.app 側のパネルには iframe 内のログしか出ないので、combine 自身の
 * 失敗理由（署名エラーのコード、リレー拒否の内訳）はここでしか追えない。
 */
import { isDebugEnabled } from './debugFlag';

let started = false;

/** 例外を読める 1 行に潰す。 */
export function describeError(value: unknown): string {
  if (value instanceof DOMException) return `DOMException/${value.name}: ${value.message}`;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  return `(${typeof value})`;
}

/**
 * 調査用ログ。デバッグモードでなければ何も出さない。
 * 引数は呼び出し前に評価されるので、副作用のある式を置かないこと。
 */
export function debugLog(...args: unknown[]): void {
  if (!isDebugEnabled()) return;
  console.info('[combine:debug]', ...args);
}

/**
 * `console.error` / `console.warn` の Error 引数を文字列へ潰す。
 *
 * console-daijin はオブジェクトを `JSON.stringify` するため、Error は `{}` としか
 * 描画されない。コードもメッセージも消えてログが役に立たなくなる。
 * **`createConsoleViewer()` の後に**掛けること。先に掛けるとビューアが元の引数を
 * 拾ってしまい、正規化がパネルに反映されない。
 */
function normalizeErrorLogging(): void {
  for (const level of ['error', 'warn'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args.map((arg) => (arg instanceof Error ? describeError(arg) : arg)));
    };
  }
}

/** パネルの高さ (px)。CSS 変数でも公開し、固定 UI がこの分だけ逃げられるようにする。 */
const PANEL_HEIGHT = 160;

/**
 * パネルが載ったことを DOM に知らせる。
 *
 * パネルは画面下部を占有する。console-daijin が付ける `body { padding-bottom }` は
 * 下端に貼り付く要素までは動かさないため、下部ナビがパネルの下敷きになって
 * タップできなくなる。高さを変数で公開し、`TabBar` がその分だけ持ち上がる。
 */
function markPanelMounted(): void {
  document.documentElement.style.setProperty('--combine-debug-panel-height', `${PANEL_HEIGHT}px`);
  document.body.classList.add('combine-debug-console');
}

/** デバッグモードならパネルを起動する。多重呼び出しは無視する。 */
export async function startDebugConsole(): Promise<void> {
  if (!isDebugEnabled() || started) return;
  started = true;
  // 公開版 console-daijin 0.1.5 は未捕捉例外を拾わないので自前で橋渡しする。
  window.addEventListener('error', (event) => {
    console.error('[combine] uncaught', describeError(event.error ?? event.message));
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[combine] unhandledrejection', describeError(event.reason));
  });
  try {
    const { createConsoleViewer } = await import('console-daijin');
    createConsoleViewer({ show: 'always', height: PANEL_HEIGHT });
    markPanelMounted();
    normalizeErrorLogging();
    console.warn(
      '[combine] このパネルはページ全体の console を取り込みます。共有前に全文を確認してください。'
    );
  } catch (err) {
    console.warn('[combine] failed to start console viewer', describeError(err));
  }
}
