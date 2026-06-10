/**
 * Parent-client bridge for the embedded eHagaki composer.
 *
 * Implements the `ehagaki.embed` postMessage protocol: parent-linked login
 * (auth.login / auth.request) and signing delegation (rpc.request signEvent),
 * so the iframe never sees a private key.
 */

export const EHAGAKI_ORIGIN = 'https://lokuyow.github.io';
export const EHAGAKI_PATH = '/ehagaki/';
const NS = 'ehagaki.embed';
const VERSION = 1;

export interface EhagakiEnvelope {
  namespace: typeof NS;
  version: typeof VERSION;
  type: string;
  requestId?: string;
  payload?: Record<string, unknown>;
}

export interface PostSuccessPayload {
  timestamp: number;
  eventId: string;
  replyToEventId?: string;
  quotedEventIds?: string[];
}

export interface PostErrorPayload {
  timestamp: number;
  code: string;
  message: string;
}

export interface ComposerContext {
  reply?: string | null;
  quotes?: string[];
  content?: string;
}

export interface EhagakiBridgeOptions {
  iframe: HTMLIFrameElement;
  getPubkey: () => string | null;
  signEvent: (event: Record<string, unknown>) => Promise<unknown>;
  onPostSuccess?: (payload: PostSuccessPayload) => void;
  onPostError?: (payload: PostErrorPayload) => void;
  onReady?: () => void;
}

export interface EhagakiBridge {
  notifyLogin(pubkeyHex: string): void;
  notifyLogout(): void;
  setContext(context: ComposerContext): void;
  destroy(): void;
}

/** Build the iframe src for the embedded composer. */
export function buildEhagakiUrl(parentOrigin: string): string {
  const params = new URLSearchParams({
    parentOrigin,
    defaultLocale: 'ja',
    embedClientTag: 'true',
  });
  return `${EHAGAKI_ORIGIN}${EHAGAKI_PATH}?${params.toString()}`;
}

function isEnvelope(data: unknown): data is EhagakiEnvelope {
  if (typeof data !== 'object' || data === null) return false;
  const env = data as Record<string, unknown>;
  return env['namespace'] === NS && env['version'] === VERSION && typeof env['type'] === 'string';
}

let requestCounter = 0;
function nextRequestId(): string {
  requestCounter += 1;
  return `combine-${Date.now().toString(36)}-${requestCounter}`;
}

export function createEhagakiBridge(options: EhagakiBridgeOptions): EhagakiBridge {
  const { iframe, getPubkey, signEvent, onPostSuccess, onPostError, onReady } = options;

  function post(message: EhagakiEnvelope): void {
    iframe.contentWindow?.postMessage(message, EHAGAKI_ORIGIN);
  }

  function sendLogin(pubkeyHex: string): void {
    post({ namespace: NS, version: VERSION, type: 'auth.login', payload: { pubkeyHex } });
  }

  async function handleMessage(event: MessageEvent): Promise<void> {
    if (event.origin !== EHAGAKI_ORIGIN) return;
    if (event.source !== iframe.contentWindow) return;
    if (!isEnvelope(event.data)) return;
    const data = event.data;

    switch (data.type) {
      case 'ready': {
        onReady?.();
        const pubkeyHex = getPubkey();
        if (pubkeyHex) sendLogin(pubkeyHex);
        return;
      }
      case 'auth.request': {
        const pubkeyHex = getPubkey();
        if (pubkeyHex) {
          post({
            namespace: NS,
            version: VERSION,
            type: 'auth.result',
            requestId: data.requestId,
            payload: { pubkeyHex, capabilities: ['signEvent'] },
          });
        } else {
          post({
            namespace: NS,
            version: VERSION,
            type: 'auth.error',
            requestId: data.requestId,
            payload: { code: 'parent_client_not_logged_in', message: 'Not logged in' },
          });
        }
        return;
      }
      case 'rpc.request': {
        const method = data.payload?.['method'];
        if (method !== 'signEvent') {
          post({
            namespace: NS,
            version: VERSION,
            type: 'rpc.error',
            requestId: data.requestId,
            payload: { code: 'unsupported_method', message: `Unsupported method: ${method}` },
          });
          return;
        }
        const params = data.payload?.['params'] as { event?: Record<string, unknown> } | undefined;
        const unsigned = params?.event;
        if (!unsigned || typeof unsigned !== 'object') {
          post({
            namespace: NS,
            version: VERSION,
            type: 'rpc.error',
            requestId: data.requestId,
            payload: { code: 'invalid_request', message: 'signEvent requires params.event' },
          });
          return;
        }
        try {
          const signed = await signEvent(unsigned);
          post({
            namespace: NS,
            version: VERSION,
            type: 'rpc.result',
            requestId: data.requestId,
            payload: { result: signed as Record<string, unknown> },
          });
        } catch (err) {
          post({
            namespace: NS,
            version: VERSION,
            type: 'rpc.error',
            requestId: data.requestId,
            payload: {
              code: 'rpc_failed',
              message: err instanceof Error ? err.message : String(err),
            },
          });
        }
        return;
      }
      case 'post.success':
        onPostSuccess?.(data.payload as unknown as PostSuccessPayload);
        return;
      case 'post.error':
        onPostError?.(data.payload as unknown as PostErrorPayload);
        return;
      default:
        // storage.* / idb.* delegation is not implemented; eHagaki falls back
        // to its own partitioned storage in that case.
        return;
    }
  }

  const listener = (event: MessageEvent) => {
    void handleMessage(event);
  };
  window.addEventListener('message', listener);

  return {
    notifyLogin: sendLogin,
    notifyLogout() {
      post({ namespace: NS, version: VERSION, type: 'auth.logout' });
    },
    setContext(context: ComposerContext) {
      post({
        namespace: NS,
        version: VERSION,
        type: 'composer.setContext',
        requestId: nextRequestId(),
        payload: {
          reply: context.reply ?? null,
          quotes: context.quotes ?? [],
          ...(context.content !== undefined ? { content: context.content } : {}),
        },
      });
    },
    destroy() {
      window.removeEventListener('message', listener);
    },
  };
}
