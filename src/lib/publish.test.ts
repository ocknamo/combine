import { describe, expect, it, vi } from 'vitest';
import { type PublishSocket, publishEvent, readOk } from './publish';

const EVENT = { id: 'a'.repeat(64) };

type Listener = (ev: { data?: unknown }) => void;

/** A stand-in for the browser's WebSocket: there is no DOM in this suite. */
class FakeSocket implements PublishSocket {
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

  /** Connect, then answer the EVENT the way a relay would. */
  answer(ok: boolean, reason = ''): void {
    this.emit('open');
    this.emit('message', { data: JSON.stringify(['OK', EVENT.id, ok, reason]) });
  }
}

describe('readOk', () => {
  it('reads the relay verdict for our event', () => {
    expect(readOk(JSON.stringify(['OK', EVENT.id, true, '']), EVENT.id)).toEqual({
      ok: true,
      reason: '',
    });
    expect(readOk(JSON.stringify(['OK', EVENT.id, false, 'blocked']), EVENT.id)).toEqual({
      ok: false,
      reason: 'blocked',
    });
  });

  it('ignores frames that are not our answer', () => {
    expect(readOk(JSON.stringify(['OK', 'b'.repeat(64), true, '']), EVENT.id)).toBeNull();
    expect(readOk(JSON.stringify(['NOTICE', 'hello']), EVENT.id)).toBeNull();
    expect(readOk(JSON.stringify(['EOSE', 'sub']), EVENT.id)).toBeNull();
    expect(readOk('not json', EVENT.id)).toBeNull();
    expect(readOk(new ArrayBuffer(4), EVENT.id)).toBeNull();
  });
});

describe('publishEvent', () => {
  it('sends the event and reports the relays that took it', async () => {
    const sockets = new Map<string, FakeSocket>();
    const createSocket = (url: string) => {
      const socket = new FakeSocket();
      sockets.set(url, socket);
      return socket;
    };

    const result = publishEvent(EVENT, ['wss://a.example', 'wss://b.example'], { createSocket });
    await vi.waitFor(() => expect(sockets.size).toBe(2));
    sockets.get('wss://a.example')?.answer(true);
    sockets.get('wss://b.example')?.answer(false, 'blocked: no');

    expect(await result).toEqual({
      accepted: ['wss://a.example'],
      rejected: [{ relay: 'wss://b.example', reason: 'blocked: no' }],
    });
    expect(sockets.get('wss://a.example')?.sent).toEqual([JSON.stringify(['EVENT', EVENT])]);
    expect(sockets.get('wss://a.example')?.closed).toBe(1);
    expect(sockets.get('wss://b.example')?.closed).toBe(1);
  });

  it('gives up on a relay that never answers', async () => {
    vi.useFakeTimers();
    try {
      const socket = new FakeSocket();
      const result = publishEvent(EVENT, ['wss://quiet.example'], {
        createSocket: () => socket,
        timeoutMs: 100,
      });
      socket.emit('open');
      await vi.advanceTimersByTimeAsync(100);
      expect(await result).toEqual({
        accepted: [],
        rejected: [{ relay: 'wss://quiet.example', reason: 'タイムアウト' }],
      });
      expect(socket.closed).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats a failed connection and an early close as refusals', async () => {
    const sockets: FakeSocket[] = [];
    const createSocket = () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    };
    const result = publishEvent(EVENT, ['wss://down.example', 'wss://rude.example'], {
      createSocket,
    });
    await vi.waitFor(() => expect(sockets.length).toBe(2));
    sockets[0].emit('error');
    sockets[1].emit('close');

    const { accepted, rejected } = await result;
    expect(accepted).toEqual([]);
    expect(rejected.map((r) => r.relay)).toEqual(['wss://down.example', 'wss://rude.example']);
  });

  it('reports a socket that could not even be created', async () => {
    const result = await publishEvent(EVENT, ['not a url'], {
      createSocket: () => {
        throw new Error('bad url');
      },
    });
    expect(result).toEqual({ accepted: [], rejected: [{ relay: 'not a url', reason: 'bad url' }] });
  });

  it('answers with nothing published when there are no relays', async () => {
    expect(await publishEvent(EVENT, [], { createSocket: () => new FakeSocket() })).toEqual({
      accepted: [],
      rejected: [],
    });
  });
});
