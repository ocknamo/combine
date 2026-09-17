// startDebugConsole() は window / document を触るため DOM 環境で動かす。
// 他の spec は node 環境のままにしたいのでファイル単位で指定する。
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debugLog, describeError, startDebugConsole } from './debugConsole';

const createConsoleViewer = vi.fn();
vi.mock('console-daijin', () => ({
  createConsoleViewer: (...args: unknown[]) => createConsoleViewer(...args),
}));

describe('describeError', () => {
  it('keeps the name, which is what distinguishes the failure modes', () => {
    expect(describeError(new DOMException('nope', 'NotAllowedError'))).toBe(
      'DOMException/NotAllowedError: nope'
    );
    expect(describeError(new Error('NosskeyIframeClient destroyed.'))).toBe(
      'Error: NosskeyIframeClient destroyed.'
    );
    expect(describeError('boom')).toBe('boom');
  });
});

describe('debugLog', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is silent without the debug flag', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    debugLog('hello');
    expect(info).not.toHaveBeenCalled();
  });

  it('logs under a stable prefix with the flag', () => {
    window.history.pushState({}, '', '/?debug=1');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    debugLog('hello', { a: 1 });
    expect(info).toHaveBeenCalledWith('[combine:debug]', 'hello', { a: 1 });
  });
});

describe('startDebugConsole', () => {
  beforeEach(() => {
    createConsoleViewer.mockReset();
    window.history.pushState({}, '', '/');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing without the debug flag', async () => {
    await startDebugConsole();
    expect(createConsoleViewer).not.toHaveBeenCalled();
  });

  // console-daijin の console 差し替えは createConsoleViewer() の末尾で行われる。
  // 正規化を先に掛けるとビューアが元の引数を拾い、パネルには `{}` が残る。
  it('normalizes Error arguments only after the viewer has hooked console', async () => {
    window.history.pushState({}, '', '/?debug=1');
    const captured: unknown[][] = [];
    createConsoleViewer.mockImplementation(() => {
      // ビューアが console を包むのを模して、受け取った引数を記録する。
      const original = console.error.bind(console);
      console.error = (...args: unknown[]) => {
        captured.push(args);
        original(...args);
      };
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await startDebugConsole();
    console.error('[combine] reaction failed:', new Error('NosskeyIframeClient destroyed.'));

    expect(captured).toHaveLength(1);
    expect(captured[0][1]).toBe('Error: NosskeyIframeClient destroyed.');
  });
});
