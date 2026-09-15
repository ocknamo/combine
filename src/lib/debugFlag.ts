/**
 * `?debug=1` を Nosskey 署名 iframe へ伝播する。
 *
 * nosskey.app はこのフラグが付いているときだけページ内にコンソールパネルを出す。
 * iPhone は DevTools を開けないため、iOS のストレージ分離（クロスオリジン iframe
 * から鍵情報が見えない）を実機で切り分けるにはこれが要る。
 */

/** 値なし（`?debug`）も有効とする。 */
const TRUTHY = new Set(['', '1', 'true', 'on', 'yes']);

/** このアプリがデバッグモードで開かれているか。 */
export function isDebugEnabled(search?: string): boolean {
  const query = search ?? (typeof location === 'undefined' ? '' : location.search);
  if (!query) return false;
  const value = new URLSearchParams(query).get('debug');
  return value !== null && TRUTHY.has(value.toLowerCase());
}

/**
 * iframe URL の検索クエリへ `debug=1` を積む。ハッシュではなく検索クエリなのは、
 * `NosskeyIframeClient` が `searchParams.set()` で `embedded` 等を足す実装だから。
 * パースできない入力はそのまま返し、計測用の付加機能でログインを落とさない。
 */
export function withDebugFlag(url: string, enabled: boolean): string {
  if (!enabled || !url) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('debug', '1');
    return parsed.toString();
  } catch {
    return url;
  }
}
