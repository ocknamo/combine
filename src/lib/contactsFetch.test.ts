import { describe, expect, it, vi } from 'vitest';
import type { ContactList } from './contacts';
import { fetchContacts, isEose, type QuerySocket, readContactEvent } from './contactsFetch';
import { verifyEvent } from './verifyEvent';
import { signTestEvent, TEST_PUBKEY } from './verifyEvent.test-helpers';

const ME = 'a'.repeat(64);
const ALICE = 'b'.repeat(64);
const BOB = 'c'.repeat(64);

/** These tests are about the sockets; signatures have their own below and in `verifyEvent.test.ts`. */
const anySignature = () => true;

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
    expect(
      readContactEvent(JSON.stringify(['EVENT', 'sub', event]), 'sub', ME, anySignature)
    ).toEqual(event);
  });

  it('ignores frames that are not ours', () => {
    expect(
      readContactEvent(JSON.stringify(['EVENT', 'other', event]), 'sub', ME, anySignature)
    ).toBeNull();
    expect(
      readContactEvent(
        JSON.stringify(['EVENT', 'sub', { ...event, pubkey: ALICE }]),
        'sub',
        ME,
        anySignature
      )
    ).toBeNull();
    expect(
      readContactEvent(
        JSON.stringify(['EVENT', 'sub', { ...event, kind: 1 }]),
        'sub',
        ME,
        anySignature
      )
    ).toBeNull();
    expect(
      readContactEvent(JSON.stringify(['NOTICE', 'hello']), 'sub', ME, anySignature)
    ).toBeNull();
    expect(readContactEvent('not json', 'sub', ME, anySignature)).toBeNull();
    expect(readContactEvent(new ArrayBuffer(4), 'sub', ME, anySignature)).toBeNull();
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
    const pending = fetchContacts(ME, relays, { createSocket: create, verify: anySignature });
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
    const pending = fetchContacts(ME, relays, { createSocket: create, verify: anySignature });
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
    const pending = fetchContacts(ME, relays, { createSocket: create, verify: anySignature });
    all.get(relays[0] as string)?.answer([{ created_at: 1000 }, { created_at: 3000 }]);
    all.get(relays[1] as string)?.answer([]);
    expect((await pending).event?.created_at).toBe(3000);
  });

  it('closes the subscription before dropping the socket', async () => {
    const { create, all } = sockets();
    const pending = fetchContacts(ME, [relays[0] as string], {
      createSocket: create,
      verify: anySignature,
    });
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
      const pending = fetchContacts(ME, relays, {
        createSocket: create,
        timeoutMs: 100,
        verify: anySignature,
      });
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
    const pending = fetchContacts(ME, relays, { createSocket: create, verify: anySignature });
    for (const socket of all.values()) socket.emit('error');

    const result = await pending;
    expect(result.event).toBeNull();
    expect(result.answered).toEqual([]);
    expect(result.failed).toHaveLength(2);
  });

  it('records who reached EOSE when nobody had a list', async () => {
    // Here the relays have spoken: there really is no contact list.
    const { create, all } = sockets();
    const pending = fetchContacts(ME, relays, { createSocket: create, verify: anySignature });
    for (const socket of all.values()) socket.answer([]);

    const result = await pending;
    expect(result.event).toBeNull();
    expect(result.answered).toEqual(relays);
  });

  it('counts a relay that hung up before EOSE as a failure', async () => {
    const { create, all } = sockets();
    const pending = fetchContacts(ME, [relays[0] as string], {
      createSocket: create,
      verify: anySignature,
    });
    all.get(relays[0] as string)?.emit('close');

    const result = await pending;
    expect(result.answered).toEqual([]);
    expect(result.failed[0]?.reason).toBe('接続が閉じられました');
  });

  it('opens nothing when there are no relays to ask', async () => {
    const create = vi.fn();
    expect(await fetchContacts(ME, [], { createSocket: create, verify: anySignature })).toEqual({
      event: null,
      answered: [],
      failed: [],
    });
    expect(create).not.toHaveBeenCalled();
  });
});

describe('signatures', () => {
  const now = Math.floor(Date.now() / 1000);
  const frame = (event: unknown) => JSON.stringify(['EVENT', 'sub', event]);

  it('reads a list its author signed', () => {
    const signed = signTestEvent({ kind: 3, created_at: now, content: '', tags: [['p', ALICE]] });
    expect(readContactEvent(frame(signed), 'sub', TEST_PUBKEY, verifyEvent)?.tags).toEqual([
      ['p', ALICE],
    ]);
  });

  it('refuses a list nobody signed, or whose content changed after signing', () => {
    const signed = signTestEvent({ kind: 3, created_at: now, content: '', tags: [['p', ALICE]] });
    const { id: _id, sig: _sig, ...unsigned } = signed;
    expect(readContactEvent(frame(unsigned), 'sub', TEST_PUBKEY, verifyEvent)).toBeNull();
    expect(
      readContactEvent(frame({ ...signed, tags: [] }), 'sub', TEST_PUBKEY, verifyEvent)
    ).toBeNull();
  });

  it('builds on the signed list when another relay answers with a newer forgery', async () => {
    const { create, all } = sockets();
    const relays = ['wss://honest', 'wss://hostile'];
    const pending = fetchContacts(TEST_PUBKEY, relays, { createSocket: create });

    const genuine = signTestEvent({ kind: 3, created_at: now, content: '', tags: [['p', ALICE]] });
    await vi.waitFor(() => expect(all.size).toBe(2));
    const honest = all.get('wss://honest') as FakeSocket;
    honest.emit('open');
    honest.emit('message', { data: JSON.stringify(['EVENT', honest.subId, genuine]) });
    honest.emit('message', { data: JSON.stringify(['EOSE', honest.subId]) });

    const hostile = all.get('wss://hostile') as FakeSocket;
    hostile.emit('open');
    hostile.emit('message', {
      data: JSON.stringify([
        'EVENT',
        hostile.subId,
        { ...genuine, created_at: now + 60, tags: [['p', BOB]] },
      ]),
    });
    hostile.emit('message', { data: JSON.stringify(['EOSE', hostile.subId]) });

    const result = await pending;
    expect(result.event?.tags).toEqual([['p', ALICE]]);
    expect(result.answered).toEqual(relays);
  });

  // Our own list from a device with a fast clock: refusing it would not take it
  // off the relays, where it keeps winning, so it has to be the base.
  it('builds on a signed list dated ahead of this clock', () => {
    const future = signTestEvent({ kind: 3, created_at: now + 3600, content: '', tags: [] });
    expect(readContactEvent(frame(future), 'sub', TEST_PUBKEY, verifyEvent)).not.toBeNull();
  });

  it('stops reading a relay that sends forgeries without end', async () => {
    const { create, all } = sockets();
    const verify = vi.fn(() => false);
    const pending = fetchContacts(TEST_PUBKEY, ['wss://hostile'], { createSocket: create, verify });
    const hostile = all.get('wss://hostile') as FakeSocket;
    hostile.emit('open');
    for (let i = 0; i < 50; i++) {
      hostile.emit('message', {
        data: JSON.stringify([
          'EVENT',
          hostile.subId,
          { kind: 3, pubkey: TEST_PUBKEY, created_at: i, content: '', tags: [] },
        ]),
      });
    }

    const result = await pending;
    expect(verify).toHaveBeenCalledTimes(10);
    expect(hostile.closed).toBe(1);
    // Cut off with nothing genuine is not "holds none": it must not count
    // toward deciding that a new list should be started.
    expect(result.event).toBeNull();
    expect(result.answered).toEqual([]);
    expect(result.failed.map((f) => f.relay)).toEqual(['wss://hostile']);
  });

  it('still counts a relay that sent something genuine before the cut-off', async () => {
    const { create, all } = sockets();
    const genuine = signTestEvent({ kind: 3, created_at: now, content: '', tags: [['p', ALICE]] });
    const pending = fetchContacts(TEST_PUBKEY, ['wss://r'], {
      createSocket: create,
      verify: (e) => (e as { id?: string }).id === genuine.id,
    });
    const socket = all.get('wss://r') as FakeSocket;
    socket.emit('open');
    socket.emit('message', { data: JSON.stringify(['EVENT', socket.subId, genuine]) });
    for (let i = 0; i < 9; i++) {
      socket.emit('message', {
        data: JSON.stringify(['EVENT', socket.subId, { ...genuine, id: `${i}`.padStart(64, '0') }]),
      });
    }

    const result = await pending;
    expect(result.event?.tags).toEqual([['p', ALICE]]);
    expect(result.answered).toEqual(['wss://r']);
  });

  it('checks signatures when the caller does not pass a checker', async () => {
    const { create, all } = sockets();
    const pending = fetchContacts(TEST_PUBKEY, ['wss://r'], { createSocket: create });
    const signed = signTestEvent({ kind: 3, created_at: now, content: '', tags: [['p', ALICE]] });
    // The verifier is loaded on demand, so wait for the socket to exist.
    await vi.waitFor(() => expect(all.get('wss://r')).toBeDefined());
    const socket = all.get('wss://r') as FakeSocket;
    socket.emit('open');
    socket.emit('message', {
      data: JSON.stringify(['EVENT', socket.subId, { ...signed, tags: [['p', BOB]] }]),
    });
    socket.emit('message', { data: JSON.stringify(['EOSE', socket.subId]) });

    expect((await pending).event).toBeNull();
  });
});
