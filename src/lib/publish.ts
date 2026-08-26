/**
 * Sending a signed event to relays — combine's first write path.
 *
 * No library for it: NIP-01's write side is one socket, one `["EVENT", ev]` and
 * one `["OK", …]`, and neither nostr-tools nor rx-nostr is a direct dependency.
 *
 * nostr-cache replaces `globalThis.WebSocket` to intercept the one URL its
 * in-page relay answers on, so this reaches either that relay or an upstream
 * `wss://` without knowing the difference.
 */

/** The minimum of the WebSocket API this needs, so a test can stand one in. */
export interface PublishSocket {
  send(data: string): void;
  close(): void;
  addEventListener(
    type: 'open' | 'message' | 'error' | 'close',
    listener: (ev: { data?: unknown }) => void
  ): void;
}

export interface PublishOptions {
  createSocket?: (url: string) => PublishSocket;
  /** How long one relay gets to answer, connection included. */
  timeoutMs?: number;
}

export interface PublishResult {
  /** Relays that answered `["OK", id, true]`. */
  accepted: string[];
  /** Relays that refused, failed or never answered, with why. */
  rejected: { relay: string; reason: string }[];
}

const PUBLISH_TIMEOUT_MS = 8000;

/**
 * A relay's answer to our EVENT, out of one incoming frame, or `null`.
 *
 * Only the `OK` for the id we sent counts: a relay is free to send an `EOSE`, a
 * `NOTICE` or someone else's `OK` down the same socket.
 */
export function readOk(data: unknown, eventId: string): { ok: boolean; reason: string } | null {
  if (typeof data !== 'string') return null;
  let frame: unknown;
  try {
    frame = JSON.parse(data);
  } catch {
    return null;
  }
  if (!Array.isArray(frame) || frame[0] !== 'OK' || frame[1] !== eventId) return null;
  return {
    ok: frame[2] === true,
    reason: typeof frame[3] === 'string' ? frame[3] : '',
  };
}

/** Send the event to one relay and resolve with what it said. */
function publishTo(
  relay: string,
  event: { id: string },
  createSocket: (url: string) => PublishSocket,
  timeoutMs: number
): Promise<{ ok: boolean; reason: string }> {
  return new Promise((resolve) => {
    let socket: PublishSocket;
    try {
      socket = createSocket(relay);
    } catch (err) {
      resolve({ ok: false, reason: err instanceof Error ? err.message : String(err) });
      return;
    }

    let settled = false;
    const finish = (result: { ok: boolean; reason: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Otherwise a repost leaves a connection open for the life of the tab.
      try {
        socket.close();
      } catch {
        // Already closing or closed.
      }
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false, reason: 'タイムアウト' }), timeoutMs);

    socket.addEventListener('open', () => {
      try {
        socket.send(JSON.stringify(['EVENT', event]));
      } catch (err) {
        finish({ ok: false, reason: err instanceof Error ? err.message : String(err) });
      }
    });
    socket.addEventListener('message', (ev) => {
      const answer = readOk(ev.data, event.id);
      if (answer) finish(answer);
    });
    socket.addEventListener('error', () => finish({ ok: false, reason: '接続できませんでした' }));
    // Some relays drop the connection instead of answering.
    socket.addEventListener('close', () => finish({ ok: false, reason: '接続が閉じられました' }));
  });
}

/**
 * Publish a signed event to every relay, and report which took it.
 *
 * Never rejects: a relay that is down is an outcome, not an exception. One
 * acceptance is enough to call it published — relays disagree about who may
 * write to them, and reaching three of five is still reaching the network.
 */
export async function publishEvent(
  event: { id: string },
  relays: string[],
  options: PublishOptions = {}
): Promise<PublishResult> {
  const createSocket =
    options.createSocket ?? ((url: string) => new WebSocket(url) as unknown as PublishSocket);
  const timeoutMs = options.timeoutMs ?? PUBLISH_TIMEOUT_MS;

  const results = await Promise.all(
    relays.map(async (relay) => ({
      relay,
      ...(await publishTo(relay, event, createSocket, timeoutMs)),
    }))
  );

  return {
    accepted: results.filter((r) => r.ok).map((r) => r.relay),
    rejected: results.filter((r) => !r.ok).map((r) => ({ relay: r.relay, reason: r.reason })),
  };
}
