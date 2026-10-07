import { describe, expect, it } from 'vitest';
import { fetchReplaceable, type QuerySocket, type ReplaceableKind } from './replaceableFetch';

const ME = 'a'.repeat(64);

type Listener = (ev: { data?: unknown }) => void;

class FakeSocket implements QuerySocket {
  sent: string[] = [];
  #listeners = new Map<string, Listener[]>();

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {}

  addEventListener(type: string, listener: Listener): void {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]);
  }

  emit(type: string, ev: { data?: unknown } = {}): void {
    for (const listener of this.#listeners.get(type) ?? []) listener(ev);
  }
}

interface Note {
  created_at: number;
}

const KIND_7: ReplaceableKind<Note> = {
  kind: 7,
  parse: (value) =>
    typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 7
      ? { created_at: (value as { created_at: number }).created_at }
      : null,
  pickLatest: (events) =>
    events.reduce<Note | null>((a, b) => (b && (!a || b.created_at > a.created_at) ? b : a), null),
};

describe('fetchReplaceable', () => {
  it('asks for the kind it was given and vets events with its parser', async () => {
    const socket = new FakeSocket();
    const pending = fetchReplaceable(KIND_7, ME, ['wss://r'], { createSocket: () => socket });

    socket.emit('open');
    const req = JSON.parse(socket.sent[0] as string);
    expect(req[2]).toEqual({ kinds: [7], authors: [ME] });
    const subId = req[1];
    for (const event of [
      { kind: 7, created_at: 5 },
      { kind: 1, created_at: 9 },
    ]) {
      socket.emit('message', { data: JSON.stringify(['EVENT', subId, event]) });
    }
    socket.emit('message', { data: JSON.stringify(['EOSE', subId]) });

    expect(await pending).toEqual({ event: { created_at: 5 }, answered: ['wss://r'], failed: [] });
  });
});
