import { describe, expect, it, vi } from 'vitest';
import { createNip07Provider, installNip07, type Nip07Source } from './nip07';

const PUBKEY = 'a'.repeat(64);

function makeSource(overrides: Partial<Nip07Source> = {}): Nip07Source {
  return {
    getPubkey: () => PUBKEY,
    login: vi.fn(async () => {}),
    signEvent: vi.fn(async (event) => ({ ...event, sig: 'signed' })),
    getRelays: vi.fn(async () => ({ 'wss://relay.example': { read: true, write: true } })),
    hasUserActivation: () => false,
    ...overrides,
  };
}

describe('createNip07Provider', () => {
  it('answers getPublicKey from the session without logging in', async () => {
    const login = vi.fn(async () => {});
    const provider = createNip07Provider(makeSource({ login }));
    await expect(provider.getPublicKey()).resolves.toBe(PUBKEY);
    expect(login).not.toHaveBeenCalled();
  });

  it('rejects while signed out with no gesture, rather than prompting', async () => {
    const login = vi.fn(async () => {});
    const provider = createNip07Provider(
      makeSource({ getPubkey: () => null, hasUserActivation: () => false, login })
    );
    await expect(provider.getPublicKey()).rejects.toThrow(/not logged in/);
    expect(login).not.toHaveBeenCalled();
  });

  it('logs in when a gesture is still in effect', async () => {
    let pubkey: string | null = null;
    const login = vi.fn(async () => {
      pubkey = PUBKEY;
    });
    const provider = createNip07Provider(
      makeSource({ getPubkey: () => pubkey, hasUserActivation: () => true, login })
    );
    await expect(provider.getPublicKey()).resolves.toBe(PUBKEY);
    expect(login).toHaveBeenCalledOnce();
  });

  it('reports a login that did not sign in', async () => {
    const provider = createNip07Provider(
      makeSource({ getPubkey: () => null, hasUserActivation: () => true })
    );
    await expect(provider.getPublicKey()).rejects.toThrow(/did not complete/);
  });

  it('forwards signEvent and getRelays', async () => {
    const source = makeSource();
    const provider = createNip07Provider(source);
    await expect(provider.signEvent({ kind: 1, content: 'hi' })).resolves.toMatchObject({
      sig: 'signed',
    });
    expect(source.signEvent).toHaveBeenCalledWith({ kind: 1, content: 'hi' });
    await expect(provider.getRelays()).resolves.toHaveProperty('wss://relay.example');
  });

  it('exposes only the three methods it implements', () => {
    // Callers feature-detect nip04 / nip44; combine must not look like it has them.
    expect(Object.keys(createNip07Provider(makeSource())).sort()).toEqual([
      'getPublicKey',
      'getRelays',
      'signEvent',
    ]);
  });
});

describe('installNip07', () => {
  it('publishes the provider and restores what was there', async () => {
    const target: { nostr?: unknown } = {};
    const uninstall = installNip07(target as Parameters<typeof installNip07>[0], makeSource());
    expect(typeof (target.nostr as { signEvent: unknown }).signEvent).toBe('function');
    uninstall();
    expect('nostr' in target).toBe(false);
  });

  it('replaces an extension provider and puts it back', () => {
    const extension = { getPublicKey: async () => 'other' } as never;
    const target = { nostr: extension };
    const uninstall = installNip07(target, makeSource());
    expect(target.nostr).not.toBe(extension);
    uninstall();
    expect(target.nostr).toBe(extension);
  });
});
