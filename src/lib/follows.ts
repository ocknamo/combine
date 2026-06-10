/**
 * Fetch the latest kind 3 (contact list) for a pubkey straight from relays
 * over WebSocket, and return the followed hex pubkeys.
 */

interface ContactEvent {
  created_at: number;
  tags: string[][];
}

const CACHE_PREFIX = 'combine:follows:';
const CACHE_TTL_MS = 10 * 60 * 1000;

function readCache(pubkey: string): string[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + pubkey);
    if (!raw) return null;
    const { at, follows } = JSON.parse(raw) as { at: number; follows: string[] };
    if (Date.now() - at > CACHE_TTL_MS) return null;
    return follows;
  } catch {
    return null;
  }
}

function writeCache(pubkey: string, follows: string[]): void {
  try {
    sessionStorage.setItem(CACHE_PREFIX + pubkey, JSON.stringify({ at: Date.now(), follows }));
  } catch {
    // storage full or unavailable: caching is best-effort
  }
}

function queryRelay(url: string, pubkey: string, timeoutMs: number): Promise<ContactEvent | null> {
  return new Promise((resolve) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      resolve(null);
      return;
    }
    let best: ContactEvent | null = null;
    const subId = `follows-${Math.random().toString(36).slice(2, 10)}`;
    const finish = () => {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // already closed
      }
      resolve(best);
    };
    const timer = setTimeout(finish, timeoutMs);
    ws.onopen = () => {
      ws.send(JSON.stringify(['REQ', subId, { kinds: [3], authors: [pubkey], limit: 1 }]));
    };
    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data as string);
        if (data[0] === 'EVENT' && data[1] === subId) {
          const event = data[2] as ContactEvent;
          if (!best || event.created_at > best.created_at) best = event;
        } else if (data[0] === 'EOSE' && data[1] === subId) {
          finish();
        }
      } catch {
        // ignore malformed relay messages
      }
    };
    ws.onerror = finish;
    ws.onclose = () => finish();
  });
}

/** Returns the followed hex pubkeys, newest contact list wins. */
export async function fetchFollows(
  pubkey: string,
  relays: string[],
  timeoutMs = 5000
): Promise<string[]> {
  const cached = readCache(pubkey);
  if (cached) return cached;

  const results = await Promise.all(relays.map((url) => queryRelay(url, pubkey, timeoutMs)));
  let best: ContactEvent | null = null;
  for (const event of results) {
    if (event && (!best || event.created_at > best.created_at)) best = event;
  }
  if (!best) return [];
  const follows = [
    ...new Set(
      best.tags
        .filter((tag) => tag[0] === 'p' && typeof tag[1] === 'string' && tag[1].length === 64)
        .map((tag) => tag[1])
    ),
  ];
  writeCache(pubkey, follows);
  return follows;
}
