// AuthStore は document / localStorage を触るため DOM 環境で動かす。
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 本題は 1 点だけ: **署名 iframe を作り直さない**こと。
 *
 * Storage Access のグラントはドキュメント単位なので、`visibilitychange` のたびに
 * iframe を破棄して作り直すと、ユーザーはタブに戻るたびにストレージアクセスの
 * 許可を求められる（iOS Safari 実機で確認）。この性質はコードを読んでも気づき
 * にくく、リファクタで簡単に戻ってしまうため、テストで固定する。
 */

const PUBKEY = 'a'.repeat(64);

/** `new NosskeyIframeClient()` が呼ばれた回数。 */
let constructed = 0;
let nextPubkey: string | (() => string | never) = PUBKEY;

class FakeNosskeyIframeError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

vi.mock('nosskey-iframe', () => {
  class NosskeyIframeClient {
    iframe = document.createElement('iframe');
    constructor() {
      constructed++;
    }
    async ready(): Promise<void> {}
    async getPublicKey(): Promise<string> {
      return typeof nextPubkey === 'function' ? nextPubkey() : nextPubkey;
    }
    async getRelays(): Promise<Record<string, unknown>> {
      return {};
    }
    async signEvent(event: unknown): Promise<unknown> {
      return event;
    }
    destroy(): void {}
  }
  return { NosskeyIframeClient, NosskeyIframeError: FakeNosskeyIframeError };
});

const { auth } = await import('./auth.svelte');

describe('AuthStore の署名 iframe ライフサイクル', () => {
  beforeEach(() => {
    constructed = 0;
    nextPubkey = PUBKEY;
    localStorage.clear();
    auth.pubkey = null;
    auth.error = null;
    auth.needsOnboarding = false;
  });

  it('タブ復帰のたびに iframe を作り直さない', async () => {
    await auth.login();
    expect(auth.pubkey).toBe(PUBKEY);
    const afterLogin = constructed;

    await auth.reconcileSession();
    await auth.reconcileSession();
    await auth.reconcileSession();

    expect(constructed).toBe(afterLogin);
  });

  it('ログインでも iframe を作り直さない', async () => {
    await auth.login();
    const afterFirst = constructed;
    await auth.login();

    expect(constructed).toBe(afterFirst);
  });

  // 作り直さなくなっても、別タブでの切り替え・ログアウトは拾えなければならない
  // （iframe 側の host がリクエストごとにストレージを読み直すため）。
  it('別タブでのアカウント切り替えを拾う', async () => {
    await auth.login();
    const other = 'b'.repeat(64);
    nextPubkey = other;

    await auth.reconcileSession();

    expect(auth.pubkey).toBe(other);
    expect(localStorage.getItem('combine:pubkey')).toBe(other);
  });

  it('別タブでのログアウト（NO_KEY）でこちらもログアウトする', async () => {
    await auth.login();
    nextPubkey = () => {
      throw new FakeNosskeyIframeError('NO_KEY', 'No key is configured in the iframe.');
    };

    await auth.reconcileSession();

    expect(auth.pubkey).toBeNull();
    expect(localStorage.getItem('combine:pubkey')).toBeNull();
  });

  it('一時的なエラーではセッションを落とさない', async () => {
    await auth.login();
    nextPubkey = () => {
      throw new FakeNosskeyIframeError('TIMEOUT', 'timed out');
    };

    await auth.reconcileSession();

    expect(auth.pubkey).toBe(PUBKEY);
  });
});
