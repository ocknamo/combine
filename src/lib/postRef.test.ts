import { describe, expect, it } from 'vitest';
import { toHexPubkey, toNpub } from './nip19';
import {
  AUTHOR_ACTION_ID,
  actionPath,
  normalizePostRef,
  POST_ACTIONS_ATTR,
  POST_DETAIL_ACTION,
  postPath,
  userPath,
} from './postRef';
import { parseRoute } from './routes';

const HEX = '5c04292b7f0c6a1c1b7c9a5e4d3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f';
const OTHER_HEX = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
const NOTE = 'note1tszzj2c3aq0h9qn30k3rlxr7d2u4agr7wcm3zwvpu2qzk6yjjxpqvfjc6l';

function action(event: Record<string, unknown>): Record<string, unknown> {
  return { actionId: POST_DETAIL_ACTION.id, event, status: 'ok' };
}

/** What nostr-cache sends for a tap on a card's avatar or display name. */
function authorAction(pubkey: unknown, event: Record<string, unknown> = { id: NOTE, kind: 1 }) {
  return { actionId: AUTHOR_ACTION_ID, event, status: 'ok', pubkey };
}

describe('normalizePostRef', () => {
  it('accepts hex and event bech32', () => {
    expect(normalizePostRef(HEX)).toBe(HEX);
    expect(normalizePostRef(HEX.toUpperCase())).toBe(HEX);
    expect(normalizePostRef(NOTE)).toBe(NOTE);
    expect(normalizePostRef('nevent1qqs9cp')).toBe('nevent1qqs9cp');
    expect(normalizePostRef('naddr1qq9x6')).toBe('naddr1qq9x6');
    expect(normalizePostRef(`  ${NOTE}  `)).toBe(NOTE);
  });

  it('rejects references that do not name an event', () => {
    expect(
      normalizePostRef('npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg')
    ).toBeNull();
    expect(normalizePostRef('nprofile1qqs')).toBeNull();
    expect(normalizePostRef('hello')).toBeNull();
    expect(normalizePostRef(HEX.slice(0, 63))).toBeNull();
    expect(normalizePostRef('')).toBeNull();
    expect(normalizePostRef(null)).toBeNull();
    expect(normalizePostRef(undefined)).toBeNull();
  });

  it('rejects bech32 characters outside the alphabet', () => {
    expect(normalizePostRef('note1bio')).toBeNull();
  });
});

describe('postPath', () => {
  it('round trips through the router', () => {
    expect(parseRoute(`#${postPath(NOTE)}`)).toEqual({ name: 'post', param: NOTE });
    expect(parseRoute(`#${postPath(HEX)}`)).toEqual({ name: 'post', param: HEX });
  });
});

describe('userPath', () => {
  it('round trips through the router', () => {
    const npub = toNpub(HEX) as string;
    expect(parseRoute(`#${userPath(npub)}`)).toEqual({ name: 'user', param: npub });
    expect(parseRoute(`#${userPath(HEX)}`)).toEqual({ name: 'user', param: HEX });
  });
});

describe('AUTHOR_ACTION_ID', () => {
  // Same namespace as the buttons: one id shared between the two would make the
  // press that carries a pubkey indistinguishable from the one that does not.
  it('does not collide with an action button', () => {
    const items = JSON.parse(POST_ACTIONS_ATTR) as Array<Record<string, unknown>>;
    expect(items.map((item) => item['id'])).not.toContain(AUTHOR_ACTION_ID);
  });
});

describe('POST_ACTIONS_ATTR', () => {
  // The element silently drops items that break any of these, so a typo here
  // would show up as a missing button rather than an error.
  it('survives nostr-cache normalisation', () => {
    const items = JSON.parse(POST_ACTIONS_ATTR) as Array<Record<string, unknown>>;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(8);
    for (const item of items) {
      expect(typeof item['id']).toBe('string');
      expect(item['id']).not.toBe('');
      expect(typeof item['label']).toBe('string');
      expect(item['label']).not.toBe('');
    }
    expect(new Set(items.map((item) => item['id'])).size).toBe(items.length);
  });
});

describe('actionPath', () => {
  it('opens the post itself for a note', () => {
    expect(actionPath(action({ id: HEX, kind: 1 }))).toBe(postPath(HEX));
  });

  it('opens the post itself when the kind is unknown', () => {
    expect(actionPath(action({ id: HEX }))).toBe(postPath(HEX));
    expect(actionPath(action({ id: HEX, kind: 30023 }))).toBe(postPath(HEX));
  });

  it('follows the e tag for a repost, reaction or zap', () => {
    for (const kind of [6, 7, 9735]) {
      const event = {
        id: HEX,
        kind,
        tags: [
          ['p', OTHER_HEX],
          ['e', OTHER_HEX],
        ],
      };
      expect(actionPath(action(event))).toBe(postPath(OTHER_HEX));
    }
  });

  it('takes the last e tag', () => {
    const event = {
      id: HEX,
      kind: 7,
      tags: [
        ['e', HEX],
        ['e', OTHER_HEX],
      ],
    };
    expect(actionPath(action(event))).toBe(postPath(OTHER_HEX));
  });

  it('falls back to the event itself when there is no e tag', () => {
    expect(actionPath(action({ id: HEX, kind: 7, tags: [['p', OTHER_HEX]] }))).toBe(postPath(HEX));
    expect(actionPath(action({ id: HEX, kind: 7 }))).toBe(postPath(HEX));
  });

  it('ignores another action', () => {
    expect(actionPath({ actionId: 'like', event: { id: HEX, kind: 1 } })).toBeNull();
    expect(actionPath({ event: { id: HEX, kind: 1 } })).toBeNull();
  });

  it('opens the person for a tap on the author', () => {
    const path = actionPath(authorAction(HEX));
    expect(path).toBe(userPath(toNpub(HEX) as string));
    // The npub in the URL has to name the person that was pressed.
    const route = parseRoute(`#${path}`);
    expect(toHexPubkey(route.param as string)).toBe(HEX);
  });

  it('takes the pressed person, not the event author', () => {
    // They differ on a reactor row or a quote header, if the widget ever
    // extends the same press to those. Reading `event.pubkey` would be wrong
    // there in a way that still looks right on a timeline card.
    const detail = authorAction(HEX, { id: NOTE, kind: 1, pubkey: OTHER_HEX });
    expect(actionPath(detail)).toBe(userPath(toNpub(HEX) as string));
  });

  it('takes an npub where hex is documented', () => {
    expect(actionPath(authorAction(toNpub(HEX)))).toBe(userPath(toNpub(HEX) as string));
  });

  it('ignores an author tap without a usable pubkey', () => {
    expect(actionPath(authorAction(undefined))).toBeNull();
    expect(actionPath(authorAction(''))).toBeNull();
    expect(actionPath(authorAction(42))).toBeNull();
    expect(actionPath(authorAction(HEX.slice(0, 63)))).toBeNull();
    expect(actionPath(authorAction('hello'))).toBeNull();
  });

  it('ignores a detail it cannot read an event id out of', () => {
    expect(actionPath(action({ kind: 1 }))).toBeNull();
    expect(actionPath(action({ id: '', kind: 1 }))).toBeNull();
    expect(actionPath(action({ id: 42, kind: 1 }))).toBeNull();
    expect(actionPath({ actionId: POST_DETAIL_ACTION.id })).toBeNull();
    expect(actionPath({ actionId: POST_DETAIL_ACTION.id, event: null })).toBeNull();
    expect(actionPath(null)).toBeNull();
    expect(actionPath(undefined)).toBeNull();
    expect(actionPath('detail')).toBeNull();
    expect(actionPath([])).toBeNull();
  });
});
