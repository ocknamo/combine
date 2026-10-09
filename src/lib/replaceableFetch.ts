/**
 * Reading one person's replaceable event (kind 0, kind 3) straight off the
 * upstream relays.
 *
 * What comes back is the base of an event that replaces it, so it cannot come
 * through the in-page cache: nostr-cache decides for itself how long it serves a
 * stored one, and an hour-old base would undo whatever was changed elsewhere
 * since. The cache intercepts exactly one URL in `globalThis.WebSocket`, so
 * dialling the upstreams by name goes around it. Writes still go through it
 * (`publishOwn.ts`) — only their base is fetched around it.
 */

/** The minimum of the WebSocket API this needs, so a test can stand one in. */
export interface QuerySocket {
  send(data: string): void;
  close(): void;
  addEventListener(
    type: 'open' | 'message' | 'error' | 'close',
    listener: (ev: { data?: unknown }) => void
  ): void;
}

export interface FetchReplaceableOptions {
  createSocket?: (url: string) => QuerySocket;
  /** How long one relay gets to answer, connection included. */
  timeoutMs?: number;
}

export interface FetchReplaceableResult<T> {
  /** The newest event any relay held, or `null` when none held one. */
  event: T | null;
  /**
   * Relays that reached EOSE — the ones whose silence *means* something. One in
   * here has said it holds none; one that timed out has said nothing at all.
   * Telling those apart is what separates "never set" from overwriting the
   * event of someone whose relays were briefly unreachable.
   */
  answered: string[];
  /** Relays that failed, timed out, or closed before answering. */
  failed: { relay: string; reason: string }[];
}

/** What a kind needs to be read: how to vet one event, and how to pick among several. */
export interface ReplaceableKind<T> {
  kind: number;
  /** A relay's event read as this person's, or `null`. A relay may answer with anything. */
  parse(value: unknown, pubkey: string): T | null;
  pickLatest(events: (T | null)[]): T | null;
}

const FETCH_TIMEOUT_MS = 6000;

/** Only so a relay that streams forever cannot hold the caller hostage. */
const MAX_EVENTS_PER_RELAY = 10;

/** This person's event out of one incoming frame, or `null`. */
export function readReplaceableEvent<T>(
  data: unknown,
  subId: string,
  pubkey: string,
  parse: ReplaceableKind<T>['parse']
): T | null {
  if (typeof data !== 'string') return null;
  let frame: unknown;
  try {
    frame = JSON.parse(data);
  } catch {
    return null;
  }
  if (!Array.isArray(frame) || frame[0] !== 'EVENT' || frame[1] !== subId) return null;
  return parse(frame[2], pubkey);
}

/** Whether a frame is the end of stored events for this subscription. */
export function isEose(data: unknown, subId: string): boolean {
  if (typeof data !== 'string') return false;
  try {
    const frame: unknown = JSON.parse(data);
    return Array.isArray(frame) && frame[0] === 'EOSE' && frame[1] === subId;
  } catch {
    return false;
  }
}

interface RelayAnswer<T> {
  relay: string;
  event: T | null;
  /** Reached EOSE — see {@link FetchReplaceableResult.answered}. */
  answered: boolean;
  reason: string;
}

/** Ask one relay for the event and resolve with what it said. */
function queryRelay<T>(
  relay: string,
  pubkey: string,
  spec: ReplaceableKind<T>,
  createSocket: (url: string) => QuerySocket,
  timeoutMs: number
): Promise<RelayAnswer<T>> {
  return new Promise((resolve) => {
    let socket: QuerySocket;
    try {
      socket = createSocket(relay);
    } catch (err) {
      resolve({
        relay,
        event: null,
        answered: false,
        reason: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const subId = `kind${spec.kind}-${Math.random().toString(36).slice(2, 10)}`;
    let best: T | null = null;
    let seen = 0;
    let settled = false;

    const finish = (answered: boolean, reason: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (answered) socket.send(JSON.stringify(['CLOSE', subId]));
        socket.close();
      } catch {
        // Already closing or closed.
      }
      resolve({ relay, event: best, answered, reason });
    };
    const timer = setTimeout(() => finish(false, 'タイムアウト'), timeoutMs);

    socket.addEventListener('open', () => {
      try {
        // No `limit: 1`: a relay that keeps an older one could answer with
        // that. Take everything and let `pickLatest` decide.
        socket.send(JSON.stringify(['REQ', subId, { kinds: [spec.kind], authors: [pubkey] }]));
      } catch (err) {
        finish(false, err instanceof Error ? err.message : String(err));
      }
    });
    socket.addEventListener('message', (ev) => {
      const event = readReplaceableEvent(ev.data, subId, pubkey, spec.parse);
      if (event) {
        best = spec.pickLatest([best, event]);
        seen += 1;
        if (seen >= MAX_EVENTS_PER_RELAY) finish(true, '');
        return;
      }
      if (isEose(ev.data, subId)) finish(true, '');
    });
    socket.addEventListener('error', () => finish(false, '接続できませんでした'));
    socket.addEventListener('close', () => finish(false, '接続が閉じられました'));
  });
}

/**
 * Ask every relay for one person's event of a replaceable kind.
 *
 * Never rejects, like `publishEvent`: a relay that is down is an outcome for
 * the caller to weigh — "none anywhere" and "nobody answered" look the same in
 * `event` and are opposite in consequence.
 */
export async function fetchReplaceable<T>(
  spec: ReplaceableKind<T>,
  pubkey: string,
  relays: string[],
  options: FetchReplaceableOptions = {}
): Promise<FetchReplaceableResult<T>> {
  const createSocket =
    options.createSocket ?? ((url: string) => new WebSocket(url) as unknown as QuerySocket);
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;

  const answers = await Promise.all(
    relays.map((relay) => queryRelay(relay, pubkey, spec, createSocket, timeoutMs))
  );

  return {
    event: spec.pickLatest(answers.map((a) => a.event)),
    answered: answers.filter((a) => a.answered).map((a) => a.relay),
    failed: answers.filter((a) => !a.answered).map((a) => ({ relay: a.relay, reason: a.reason })),
  };
}
