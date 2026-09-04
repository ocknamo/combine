import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContactList } from './contacts';
import type { FetchContactsResult } from './contactsFetch';
import type { PublishOwnOptions, UnsignedEvent } from './publishOwn';

const ME = 'a'.repeat(64);
const ALICE = 'b'.repeat(64);
const BOB = 'c'.repeat(64);

const READ = ['wss://read.example'];
const WRITE = ['wss://write.example'];

const auth = {
  pubkey: null as string | null,
  relays: READ,
  getWriteRelays: vi.fn(async () => WRITE),
};
const fetchContacts = vi.fn(
  async (): Promise<FetchContactsResult> => ({ event: null, answered: [], failed: [] })
);
const signAndPublish = vi.fn(async (_event: UnsignedEvent, _options?: PublishOwnOptions) => true);
const show = vi.fn();

vi.mock('./auth.svelte', () => ({ auth }));
vi.mock('./contactsFetch', () => ({ fetchContacts: () => fetchContacts() }));
vi.mock('./publishOwn', () => ({
  signAndPublish: (event: UnsignedEvent, options?: PublishOwnOptions) =>
    signAndPublish(event, options),
}));
vi.mock('./toast.svelte', () => ({ toast: { show } }));

const { follows } = await import('./follows.svelte');

function list(tags: string[][], over: Partial<ContactList> = {}): ContactList {
  return { kind: 3, pubkey: ME, created_at: 1700000000, content: '', tags, ...over };
}

/** The event handed to the signer on the nth change. */
function published(nth: number): UnsignedEvent {
  const call = signAndPublish.mock.calls[nth];
  if (!call) throw new Error(`no publish #${nth}`);
  return call[0];
}

/** What the relays answer, and how many of them actually spoke. */
function answers(event: ContactList | null, answered = READ.length + WRITE.length): void {
  fetchContacts.mockResolvedValue({ event, answered: Array(answered).fill('wss://x'), failed: [] });
}

// The store is the app's singleton, so each test starts it over.
beforeEach(() => {
  vi.clearAllMocks();
  follows.reset();
  auth.pubkey = ME;
  auth.relays = READ;
  signAndPublish.mockResolvedValue(true);
  answers(null);
});

describe('follows / refusing to publish on a base it does not have', () => {
  it('publishes nothing when no relay answered', async () => {
    fetchContacts.mockResolvedValue({ event: null, answered: [], failed: [] });
    const before = follows.revision;
    await follows.follow(ALICE);

    expect(signAndPublish).not.toHaveBeenCalled();
    expect(follows.status).toBe('unavailable');
    expect(follows.revision).toBe(before);
    expect(show).toHaveBeenCalledWith(expect.stringContaining('取得できませんでした'), 'error');
  });

  it('publishes nothing when only one relay said the list is missing', async () => {
    // A relay demanding NIP-42 AUTH reaches EOSE with nothing to show, so one
    // voice is not enough to conclude the list does not exist.
    answers(null, 1);
    await follows.follow(ALICE);

    expect(signAndPublish).not.toHaveBeenCalled();
    expect(follows.needsBootstrap).toBeNull();
  });

  it('asks before starting a list from nothing, and only then publishes', async () => {
    answers(null, 2);
    await follows.follow(ALICE);

    expect(signAndPublish).not.toHaveBeenCalled();
    expect(follows.needsBootstrap).toBe(ALICE);

    await follows.confirmBootstrap();
    expect(signAndPublish).toHaveBeenCalledTimes(1);
    expect(published(0)).toMatchObject({ kind: 3, tags: [['p', ALICE]] });
    expect(follows.needsBootstrap).toBeNull();
  });

  it('drops the offer when the user declines', () => {
    follows.needsBootstrap = ALICE;
    follows.cancelBootstrap();
    expect(follows.needsBootstrap).toBeNull();
  });

  it('publishes nothing when the built list fails its own check', async () => {
    // A base belonging to somebody else — publishing it back would replace
    // their follows under our name.
    answers(list([['p', BOB]], { pubkey: ALICE }));
    await follows.follow(ME.replace('a', 'f'));

    expect(signAndPublish).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith(
      expect.stringContaining('安全に更新できませんでした'),
      'error'
    );
  });
});

describe('follows / the base it builds on', () => {
  it('re-reads the relays on every change rather than trusting what it showed', async () => {
    answers(list([['p', BOB]]));
    await follows.ensureLoaded();
    expect(fetchContacts).toHaveBeenCalledTimes(1);

    await follows.follow(ALICE);
    expect(fetchContacts).toHaveBeenCalledTimes(2);
  });

  it('keeps the previous follow when the relays are still serving the old list', async () => {
    const stale = list([['p', BOB]], { created_at: 1000 });
    answers(stale);
    await follows.follow(ALICE);
    expect(follows.isFollowing(ALICE)).toBe(true);

    // The relays have not caught up yet and answer with the pre-ALICE list.
    answers(stale);
    await follows.follow(ME.replace('a', 'f'));

    expect(published(1).tags).toContainEqual(['p', ALICE]);
    expect(published(1).tags).toContainEqual(['p', BOB]);
  });

  it('adopts a list newer than its own, from another device', async () => {
    answers(list([['p', BOB]], { created_at: 1000 }));
    await follows.follow(ALICE);

    const newer = list(
      [
        ['p', BOB],
        ['p', ME.replace('a', 'f')],
      ],
      { created_at: 9_000_000_000 }
    );
    answers(newer);
    await follows.unfollow(BOB);

    expect(published(1).tags).toEqual([['p', ME.replace('a', 'f')]]);
  });
});

describe('follows / publishing', () => {
  it('sends the contact list to the write relays as well as the cache', async () => {
    answers(list([['p', BOB]]));
    await follows.follow(ALICE);
    expect(signAndPublish).toHaveBeenCalledWith(expect.anything(), { writeRelays: true });
  });

  it('records the change and bumps the revision the timeline is keyed on', async () => {
    answers(list([['p', BOB]]));
    const before = follows.revision;
    await follows.follow(ALICE);

    expect(follows.isFollowing(ALICE)).toBe(true);
    expect(follows.revision).toBe(before + 1);
    expect(show).toHaveBeenCalledWith('フォローしました');
  });

  it('leaves the list alone when no relay took the event', async () => {
    answers(list([['p', BOB]]));
    signAndPublish.mockResolvedValue(false);
    const before = follows.revision;
    await follows.follow(ALICE);

    expect(follows.isFollowing(ALICE)).toBe(false);
    expect(follows.revision).toBe(before);
    expect(show).toHaveBeenCalledWith('フォローに失敗しました', 'error');
  });

  it('releases the button when signing throws', async () => {
    answers(list([['p', BOB]]));
    signAndPublish.mockRejectedValue(new Error('rejected at nosskey.app'));
    const before = follows.revision;
    await follows.follow(ALICE);

    expect(follows.pending).toBeNull();
    expect(follows.revision).toBe(before);
  });

  it('unfollows', async () => {
    answers(
      list([
        ['p', ALICE],
        ['p', BOB],
      ])
    );
    await follows.unfollow(ALICE);

    expect(follows.isFollowing(ALICE)).toBe(false);
    expect(published(0)).toMatchObject({ tags: [['p', BOB]] });
  });
});

describe('follows / what it refuses to do at all', () => {
  it('runs one change at a time', async () => {
    // Two lists built on one base would have the second undo the first.
    answers(list([['p', BOB]]));
    const first = follows.follow(ALICE);
    const second = follows.follow(ME.replace('a', 'f'));
    await Promise.all([first, second]);

    expect(signAndPublish).toHaveBeenCalledTimes(1);
  });

  it('does nothing while signed out', async () => {
    auth.pubkey = null;
    await follows.follow(ALICE);

    expect(fetchContacts).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith(expect.stringContaining('ログイン'), 'error');
  });

  it('does not follow oneself', async () => {
    await follows.follow(ME);
    expect(fetchContacts).not.toHaveBeenCalled();
  });

  it('does not republish for somebody already followed', async () => {
    answers(list([['p', ALICE]]));
    await follows.follow(ALICE);

    expect(signAndPublish).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith('すでにフォローしています');
  });

  it('does not republish for somebody not followed', async () => {
    answers(list([['p', BOB]]));
    await follows.unfollow(ALICE);

    expect(signAndPublish).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith('フォローしていません');
  });
});

describe('follows / accounts', () => {
  it('reads the list once per account, then serves it from memory', async () => {
    answers(list([['p', ALICE]]));
    await follows.ensureLoaded();
    await follows.ensureLoaded();

    expect(fetchContacts).toHaveBeenCalledTimes(1);
    expect(follows.isFollowing(ALICE)).toBe(true);
  });

  it('starts over when the account is switched at nosskey.app', async () => {
    answers(list([['p', ALICE]]));
    await follows.ensureLoaded();

    auth.pubkey = BOB;
    answers(list([['p', BOB]], { pubkey: BOB }));
    await follows.ensureLoaded();

    expect(fetchContacts).toHaveBeenCalledTimes(2);
    expect(follows.isFollowing(ALICE)).toBe(false);
  });
});
