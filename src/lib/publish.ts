/**
 * Sending a signed event to relays — combine's first write path.
 *
 * Everything else the app publishes goes through an embed (eHagaki posts, and
 * publishes them itself). A repost has no embed to delegate to, and NIP-01's
 * write side is small enough to do here: open a socket, send `["EVENT", ev]`,
 * wait for `["OK", <id>, …]`. No library is pulled in for it — neither
 * nostr-tools nor rx-nostr is a direct dependency, and this is the whole
 * protocol.
 *
 * Relays are tried in parallel and one acceptance is a success: relays
 * disagree about who may write to them, and a post that reached three of five
 * is a post that happened.
 *
 * nostr-cache replaces `globalThis.WebSocket` to intercept the one URL its
 * in-page relay answers on, so a connection to an upstream `wss://` passes
 * straight through to the real socket.
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

export const PUBLISH_TIMEOUT_MS = 8000;

/**
 * Read a relay's answer to our EVENT out of one incoming frame.
 *
 * Only the `OK` for the id we sent counts. A relay is free to send anything
 * else down the same socket — an `EOSE` for a subscription, a `NOTICE` — and
 * none of it says whether our event landed.
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
      // The socket has done its one job either way; leaving it open would hold
      // a connection per repost for as long as the tab lives.
      try {
        socket.close();
      } catch {
        // Already closing or closed — nothing left to do.
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
    // A close before the OK is a refusal without a message — some relays drop
    // the connection instead of answering.
    socket.addEventListener('close', () => finish({ ok: false, reason: '接続が閉じられました' }));
  });
}

/**
 * Publish a signed event to every relay, and report which took it.
 *
 * Never rejects: a relay that is down is an outcome, not an exception, and the
 * caller decides what to say from {@link PublishResult.accepted} being empty.
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
