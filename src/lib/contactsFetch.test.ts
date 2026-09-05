import { describe, expect, it, vi } from 'vitest';
import type { ContactList } from './contacts';
import { fetchContacts, isEose, type QuerySocket, readContactEvent } from './contactsFetch';

const ME = 'a'.repeat(64);
const ALICE = 'b'.repeat(64);
const BOB = 'c'.repeat(64);

type Listener = (ev: { data?: unknown }) => void;

/** A stand-in for the browser's WebSocket: there is no DOM in this suite. */
class FakeSocket implements QuerySocket {
  sent: string[] = [];
  closed = 0;
  #listeners = new Map<string, Listener[]>();

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed += 1;
  }

  addEventListener(type: string, listener: Listener): void {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]);
  }

  emit(type: string, ev: { data?: unknown } = {}): void {
    for (const listener of this.#listeners.get(type) ?? []) listener(ev);
  }

  /** The subscription id this socket was asked to open. */
  get subId(): string {
    return JSON.parse(this.sent[0] as string)[1];
  }

  /** Connect, then answer the REQ the way a relay would. */
  answer(events: Partial<ContactList>[]): void {
    this.emit('open');
    for (const event of events) {
      this.emit('message', {
        data: JSON.stringify([
          'EVENT',
          this.subId,
          { kind: 3, pubkey: ME, created_at: 1000, content: '', tags: [], ...event },
        ]),
      });
    }
    this.emit('message', { data: JSON.stringify(['EOSE', this.subId]) });
  }
}

/** Hand out a socket per relay and let the test drive each one. */
function sockets(): { create: (url: string) => QuerySocket; all: Map<string, FakeSocket> } {
  const all = new Map<string, FakeSocket>();
  return {
    create: (url: string) => {
      const socket = new FakeSocket();
      all.set(url, socket);
      return socket;
    },
    all,
  };
}

describe('readContactEvent', () => {
  const event = { kind: 3, pubkey: ME, created_at: 1000, content: '', tags: [['p', ALICE]] };

  it('reads our contact list off the subscription we opened', () => {
    expect(readContactEvent(JSON.stringify(['EVENT', 'sub', event]), 'sub', ME)).toEqual(event);
  });

  it('ignores frames that are not ours', () => {
    expect(readContactEvent(JSON.stringify(['EVENT', 'other', event]), 'sub', ME)).toBeNull();
    expect(
      readContactEvent(JSON.stringify(['EVENT', 'sub', { ...event, pubkey: ALICE }]), 'sub', ME)
    ).toBeNull();
    expect(
      readContactEvent(JSON.stringify(['EVENT', 'sub', { ...event, kind: 1 }]), 'sub', ME)
    ).toBeNull();
    expect(readContactEvent(JSON.stringify(['NOTICE', 'hello']), 'sub', ME)).toBeNull();
    expect(readContactEvent('not json', 'sub', ME)).toBeNull();
    expect(readContactEvent(new ArrayBuffer(4), 'sub', ME)).toBeNull();
  });
});

describe('isEose', () => {
  it('recognises the end of stored events for our subscription', () => {
    expect(isEose(JSON.stringify(['EOSE', 'sub']), 'sub')).toBe(true);
    expect(isEose(JSON.stringify(['EOSE', 'other']), 'sub')).toBe(false);
    expect(isEose(JSON.stringify(['EVENT', 'sub', {}]), 'sub')).toBe(false);
    expect(isEose('not json', 'sub')).toBe(false);
  });
});

describe('fetchContacts', () => {
  const relays = ['wss://a.example', 'wss://b.example'];

  it('asks every relay for this person only', async () => {
    const { create, all } = sockets();
    const pending = fetchContacts(ME, relays, { createSocket: create });
    for (const socket of all.values()) socket.answer([]);
    await pending;

    const req = JSON.parse(all.get(relays[0] as string)?.sent[0] as string);
    expect(req[0]).toBe('REQ');
    // No `limit`: a relay that keeps an older list should still be able to
    // offer it, so `pickLatest` can weigh it.
    expect(req[2]).toEqual({ kinds: [3], authors: [ME] });
  });

  it('takes the newest list across relays', async () => {
    const { create, all } = sockets();
    const pending = fetchContacts(ME, relays, { createSocket: create });
    all.get(relays[0] as string)?.answer([{ created_at: 1000, tags: [['p', ALICE]] }]);
    all.get(relays[1] as string)?.answer([
      {
        created_at: 2000,
        tags: [
          ['p', ALICE],
          ['p', BOB],
        ],
      },
    ]);

    const result = await pending;
    expect(result.event?.created_at).toBe(2000);
    expect(result.answered).toEqual(relays);
    expect(result.failed).toEqual([]);
  });

  it('takes the newest when one relay offers several', async () => {
    const { create, all } = sockets();
    const pending = fetchContacts(ME, relays, { createSocket: create });
    all.get(relays[0] as string)?.answer([{ created_at: 1000 }, { created_at: 3000 }]);
    all.get(relays[1] as string)?.answer([]);
    expect((await pending).event?.created_at).toBe(3000);
  });

  it('closes the subscription before dropping the socket', async () => {
    const { create, all } = sockets();
    const pending = fetchContacts(ME, [relays[0] as string], { createSocket: create });
    const socket = all.get(relays[0] as string) as FakeSocket;
    socket.answer([]);
    await pending;

    expect(JSON.parse(socket.sent[1] as string)).toEqual(['CLOSE', socket.subId]);
    expect(socket.closed).toBe(1);
  });

  it('uses what one relay answered when the other times out', async () => {
    vi.useFakeTimers();
    try {
      const { create, all } = sockets();
      const pending = fetchContacts(ME, relays, { createSocket: create, timeoutMs: 100 });
      all.get(relays[0] as string)?.answer([{ created_at: 1000, tags: [['p', ALICE]] }]);
      vi.advanceTimersByTime(100);

      const result = await pending;
      expect(result.event?.created_at).toBe(1000);
      expect(result.answered).toEqual([relays[0]]);
      expect(result.failed).toEqual([{ relay: relays[1], reason: 'タイムアウト' }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers nobody when every relay failed', async () => {
    // Apart from the case below: the user may well have a list nobody handed over.
    const { create, all } = sockets();
    const pending = fetchContacts(ME, relays, { createSocket: create });
    for (const socket of all.values()) socket.emit('error');

    const result = await pending;
    expect(result.event).toBeNull();
    expect(result.answered).toEqual([]);
    expect(result.failed).toHaveLength(2);
  });

  it('records who reached EOSE when nobody had a list', async () => {
    // Here the relays have spoken: there really is no contact list.
    const { create, all } = sockets();
    const pending = fetchContacts(ME, relays, { createSocket: create });
    for (const socket of all.values()) socket.answer([]);

    const result = await pending;
    expect(result.event).toBeNull();
    expect(result.answered).toEqual(relays);
  });

  it('counts a relay that hung up before EOSE as a failure', async () => {
    const { create, all } = sockets();
    const pending = fetchContacts(ME, [relays[0] as string], { createSocket: create });
    all.get(relays[0] as string)?.emit('close');

    const result = await pending;
    expect(result.answered).toEqual([]);
    expect(result.failed[0]?.reason).toBe('接続が閉じられました');
  });

  it('opens nothing when there are no relays to ask', async () => {
    const create = vi.fn();
    expect(await fetchContacts(ME, [], { createSocket: create })).toEqual({
      event: null,
      answered: [],
      failed: [],
    });
    expect(create).not.toHaveBeenCalled();
  });
});
