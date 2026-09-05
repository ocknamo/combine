import { describe, expect, it } from 'vitest';
import {
  asContactList,
  buildContacts,
  type ContactList,
  checkContactsDiff,
  followedPubkeys,
  nextCreatedAt,
  pickLatest,
} from './contacts';

const ME = 'a'.repeat(64);
const ALICE = 'b'.repeat(64);
const BOB = 'c'.repeat(64);
const CAROL = 'd'.repeat(64);
const DAVE = 'e'.repeat(64);

function list(tags: string[][], over: Partial<ContactList> = {}): ContactList {
  return { kind: 3, pubkey: ME, created_at: 1700000000, content: '', tags, ...over };
}

describe('asContactList', () => {
  it('reads a well formed contact list', () => {
    expect(asContactList(list([['p', ALICE]]), ME)).toEqual(list([['p', ALICE]]));
  });

  it('refuses what would replace the wrong account or the wrong kind', () => {
    expect(asContactList({ ...list([]), pubkey: ALICE }, ME)).toBeNull();
    expect(asContactList({ ...list([]), kind: 0 }, ME)).toBeNull();
  });

  it('refuses malformed shapes', () => {
    expect(asContactList({ ...list([]), tags: 'nope' }, ME)).toBeNull();
    expect(asContactList({ ...list([]), tags: [['p', 1]] }, ME)).toBeNull();
    expect(asContactList({ ...list([]), content: null }, ME)).toBeNull();
    expect(asContactList({ ...list([]), created_at: 'soon' }, ME)).toBeNull();
    expect(asContactList(null, ME)).toBeNull();
    expect(asContactList('EVENT', ME)).toBeNull();
  });
});

describe('pickLatest', () => {
  it('takes the newest and ignores relays that answered with nothing', () => {
    const old = list([['p', ALICE]], { created_at: 1000 });
    const fresh = list(
      [
        ['p', ALICE],
        ['p', BOB],
      ],
      { created_at: 2000 }
    );
    expect(pickLatest([null, old, null, fresh])).toBe(fresh);
    expect(pickLatest([fresh, old])).toBe(fresh);
  });

  it('is null when nobody had one', () => {
    expect(pickLatest([null, null])).toBeNull();
    expect(pickLatest([])).toBeNull();
  });
});

describe('followedPubkeys', () => {
  it('counts 64 char lowercase hex `p` tags once each', () => {
    const base = list([
      ['p', ALICE],
      ['p', ALICE],
      ['p', BOB],
      ['t', 'nostr'],
    ]);
    expect(followedPubkeys(base)).toEqual(new Set([ALICE, BOB]));
  });

  it('does not count entries it cannot read as a pubkey', () => {
    const base = list([['p', ALICE.toUpperCase()], ['p', 'npub1whatever'], ['p', 'abc'], ['p']]);
    expect(followedPubkeys(base)).toEqual(new Set());
  });

  it('is empty for no list at all', () => {
    expect(followedPubkeys(null)).toEqual(new Set());
  });
});

describe('nextCreatedAt', () => {
  it('uses now when the clock is ahead of the base', () => {
    expect(nextCreatedAt(list([], { created_at: 1000 }), 2000)).toBe(2000);
  });

  it('steps past a base of the same second', () => {
    expect(nextCreatedAt(list([], { created_at: 1000 }), 1000)).toBe(1001);
  });

  it('steps past the base when the device clock is behind', () => {
    // Otherwise the relays keep the old list and the follow silently vanishes.
    expect(nextCreatedAt(list([], { created_at: 5000 }), 1000)).toBe(5001);
  });

  it('is just now when there is no base', () => {
    expect(nextCreatedAt(null, 1000)).toBe(1000);
  });
});

describe('buildContacts / follow', () => {
  it('appends without disturbing what was there', () => {
    const base = list([
      ['p', ALICE],
      ['t', 'nostr'],
      ['p', BOB],
    ]);
    expect(buildContacts(base, { add: CAROL }, ME, 1800000000).tags).toEqual([
      ['p', ALICE],
      ['t', 'nostr'],
      ['p', BOB],
      ['p', CAROL],
    ]);
  });

  it('carries the content over verbatim', () => {
    // Older clients keep the user's relay list in here.
    const content = '{"wss://relay.example":{"read":true,"write":true}}';
    const base = list([['p', ALICE]], { content });
    expect(buildContacts(base, { add: BOB }, ME, 1800000000).content).toBe(content);
  });

  it('keeps relay hints and petnames on the tags it copies', () => {
    const base = list([['p', ALICE, 'wss://relay.example', 'アリス']]);
    expect(buildContacts(base, { add: BOB }, ME, 1800000000).tags[0]).toEqual([
      'p',
      ALICE,
      'wss://relay.example',
      'アリス',
    ]);
  });

  it('leaves entries it cannot read alone rather than tidying them away', () => {
    // Normalising these would unfollow whoever they stand for.
    const base = list([
      ['p', ALICE.toUpperCase()],
      ['p', 'npub1whatever'],
    ]);
    expect(buildContacts(base, { add: BOB }, ME, 1800000000).tags).toEqual([
      ['p', ALICE.toUpperCase()],
      ['p', 'npub1whatever'],
      ['p', BOB],
    ]);
  });

  it('is a no-op for somebody already followed', () => {
    const base = list([['p', ALICE]]);
    expect(buildContacts(base, { add: ALICE }, ME, 1800000000).tags).toEqual([['p', ALICE]]);
  });

  it('starts a list of one when there is no base', () => {
    expect(buildContacts(null, { add: ALICE }, ME, 1800000000)).toEqual({
      kind: 3,
      content: '',
      tags: [['p', ALICE]],
      created_at: 1800000000,
      pubkey: ME,
    });
  });
});

describe('buildContacts / unfollow', () => {
  it('removes only the target', () => {
    const base = list([
      ['p', ALICE],
      ['p', BOB, 'wss://relay.example', 'ボブ'],
      ['t', 'nostr'],
    ]);
    expect(buildContacts(base, { remove: ALICE }, ME, 1800000000).tags).toEqual([
      ['p', BOB, 'wss://relay.example', 'ボブ'],
      ['t', 'nostr'],
    ]);
  });

  it('removes every duplicate of the target', () => {
    // Leaving one behind keeps the count unchanged, which `checkContactsDiff`
    // would then refuse for good.
    const base = list([
      ['p', ALICE],
      ['p', BOB],
      ['p', ALICE],
    ]);
    expect(buildContacts(base, { remove: ALICE }, ME, 1800000000).tags).toEqual([['p', BOB]]);
  });

  it('is a no-op for somebody not followed', () => {
    const base = list([['p', ALICE]]);
    expect(buildContacts(base, { remove: BOB }, ME, 1800000000).tags).toEqual([['p', ALICE]]);
  });
});

describe('checkContactsDiff', () => {
  const base = list([
    ['p', ALICE],
    ['p', BOB],
    ['t', 'nostr'],
  ]);

  it('passes an honest follow and unfollow', () => {
    const followed = buildContacts(base, { add: CAROL }, ME, 1800000000);
    expect(checkContactsDiff(base, followed, { add: CAROL })).toBeNull();
    const unfollowed = buildContacts(base, { remove: ALICE }, ME, 1800000000);
    expect(checkContactsDiff(base, unfollowed, { remove: ALICE })).toBeNull();
  });

  it('refuses a follow that did not add anyone', () => {
    const same = buildContacts(base, { add: ALICE }, ME, 1800000000);
    expect(checkContactsDiff(base, same, { add: ALICE })).toMatch(/0 人/);
  });

  it('refuses an unfollow that did not remove anyone', () => {
    const same = buildContacts(base, { remove: CAROL }, ME, 1800000000);
    expect(checkContactsDiff(base, same, { remove: CAROL })).toMatch(/0 人/);
  });

  it('refuses a change whose count adds up but which dropped somebody', () => {
    // +1 overall, yet ALICE is gone — the count alone would have let it past.
    const swapped = {
      ...buildContacts(base, { add: CAROL }, ME, 1800000000),
      tags: [
        ['p', BOB],
        ['p', CAROL],
        ['p', DAVE],
        ['t', 'nostr'],
      ],
    };
    expect(checkContactsDiff(base, swapped, { add: CAROL })).toMatch(/別の相手/);
  });

  it('refuses a wholesale wipe', () => {
    const wiped = {
      ...buildContacts(base, { remove: ALICE }, ME, 1800000000),
      tags: [['t', 'nostr']],
    };
    expect(checkContactsDiff(base, wiped, { remove: ALICE })).toMatch(/-2 人/);
  });

  it('refuses losing the tags that are not follows', () => {
    const stripped = {
      ...buildContacts(base, { add: CAROL }, ME, 1800000000),
      tags: [
        ['p', ALICE],
        ['p', BOB],
        ['p', CAROL],
      ],
    };
    expect(checkContactsDiff(base, stripped, { add: CAROL })).toMatch(/p 以外のタグ/);
  });

  it('refuses losing the content', () => {
    const withRelays = list([['p', ALICE]], { content: '{"wss://relay.example":{}}' });
    const blanked = { ...buildContacts(withRelays, { add: BOB }, ME, 1800000000), content: '' };
    expect(checkContactsDiff(withRelays, blanked, { add: BOB })).toMatch(/content/);
  });

  it('refuses an event the relays would drop as older than the base', () => {
    const stale = { ...buildContacts(base, { add: CAROL }, ME, 1800000000), created_at: 1000 };
    expect(checkContactsDiff(base, stale, { add: CAROL })).toMatch(/created_at/);
  });

  it('refuses a base that belongs to another account', () => {
    const theirs = list(
      [
        ['p', ALICE],
        ['p', BOB],
        ['t', 'nostr'],
      ],
      { pubkey: ALICE }
    );
    const next = buildContacts(theirs, { add: CAROL }, ME, 1800000000);
    expect(checkContactsDiff(theirs, next, { add: CAROL })).toMatch(/別のアカウント/);
  });

  it('allows unfollowing the only person on the list', () => {
    const one = list([['p', ALICE]]);
    const empty = buildContacts(one, { remove: ALICE }, ME, 1800000000);
    expect(checkContactsDiff(one, empty, { remove: ALICE })).toBeNull();
  });

  it('allows the first follow of a brand new list', () => {
    const first = buildContacts(null, { add: ALICE }, ME, 1800000000);
    expect(checkContactsDiff(null, first, { add: ALICE })).toBeNull();
  });
});
