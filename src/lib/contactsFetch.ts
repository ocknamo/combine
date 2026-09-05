/**
 * Reading a contact list off the relays — combine's first read path of its own.
 *
 * Everything else combine shows comes through the in-page cache relay. A list
 * about to be *replaced* cannot: nostr-cache decides for itself how long it
 * serves a stored kind 3, and one an hour old would unfollow everyone added
 * elsewhere since. So this dials the upstream relays directly, which works
 * because the cache intercepts exactly one URL in `globalThis.WebSocket`.
 * Writes still go through it (`publishOwn.ts`) — only their base is fetched
 * around it.
 */
import { asContactList, type ContactList, pickLatest } from './contacts';

/** The minimum of the WebSocket API this needs, so a test can stand one in. */
export interface QuerySocket {
  send(data: string): void;
  close(): void;
  addEventListener(
    type: 'open' | 'message' | 'error' | 'close',
    listener: (ev: { data?: unknown }) => void
  ): void;
}

export interface FetchContactsOptions {
  createSocket?: (url: string) => QuerySocket;
  /** How long one relay gets to answer, connection included. */
  timeoutMs?: number;
}

export interface FetchContactsResult {
  /** The newest list any relay held, or `null` when none held one. */
  event: ContactList | null;
  /**
   * Relays that reached EOSE — the ones whose silence *means* something. One in
   * here has said it holds no list; one that timed out has said nothing at all.
   * Telling those apart is what separates "no follows yet" from wiping the
   * follows of someone whose relays were briefly unreachable.
   */
  answered: string[];
  /** Relays that failed, timed out, or closed before answering. */
  failed: { relay: string; reason: string }[];
}

const FETCH_TIMEOUT_MS = 6000;

/** Only so a relay that streams forever cannot hold the follow button hostage. */
const MAX_EVENTS_PER_RELAY = 10;

/** This person's contact list out of one incoming frame, or `null`. */
export function readContactEvent(data: unknown, subId: string, pubkey: string): ContactList | null {
  if (typeof data !== 'string') return null;
  let frame: unknown;
  try {
    frame = JSON.parse(data);
  } catch {
    return null;
  }
  if (!Array.isArray(frame) || frame[0] !== 'EVENT' || frame[1] !== subId) return null;
  return asContactList(frame[2], pubkey);
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

interface RelayAnswer {
  relay: string;
  event: ContactList | null;
  /** Reached EOSE — see {@link FetchContactsResult.answered}. */
  answered: boolean;
  reason: string;
}

/** Ask one relay for the contact list and resolve with what it said. */
function queryRelay(
  relay: string,
  pubkey: string,
  createSocket: (url: string) => QuerySocket,
  timeoutMs: number
): Promise<RelayAnswer> {
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

    const subId = `contacts-${Math.random().toString(36).slice(2, 10)}`;
    let best: ContactList | null = null;
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
        // No `limit: 1`: a relay that keeps an older list could answer with
        // that one. Take everything and let `pickLatest` decide.
        socket.send(JSON.stringify(['REQ', subId, { kinds: [3], authors: [pubkey] }]));
      } catch (err) {
        finish(false, err instanceof Error ? err.message : String(err));
      }
    });
    socket.addEventListener('message', (ev) => {
      const event = readContactEvent(ev.data, subId, pubkey);
      if (event) {
        best = pickLatest([best, event]);
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
 * Ask every relay for one person's contact list.
 *
 * Never rejects, like `publishEvent`: a relay that is down is an outcome for
 * the caller to weigh — "no list anywhere" and "nobody answered" look the same
 * in `event` and are opposite in consequence.
 */
export async function fetchContacts(
  pubkey: string,
  relays: string[],
  options: FetchContactsOptions = {}
): Promise<FetchContactsResult> {
  const createSocket =
    options.createSocket ?? ((url: string) => new WebSocket(url) as unknown as QuerySocket);
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;

  const answers = await Promise.all(
    relays.map((relay) => queryRelay(relay, pubkey, createSocket, timeoutMs))
  );

  return {
    event: pickLatest(answers.map((a) => a.event)),
    answered: answers.filter((a) => a.answered).map((a) => a.relay),
    failed: answers.filter((a) => !a.answered).map((a) => ({ relay: a.relay, reason: a.reason })),
  };
}
