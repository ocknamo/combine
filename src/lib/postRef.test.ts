import { describe, expect, it } from 'vitest';
import {
  normalizePostRef,
  POST_ACTIONS_ATTR,
  POST_DETAIL_ACTION,
  postActionPath,
  postPath,
} from './postRef';
import { parseRoute } from './routes';

const HEX = '5c04292b7f0c6a1c1b7c9a5e4d3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f';
const OTHER_HEX = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
const NOTE = 'note1tszzj2c3aq0h9qn30k3rlxr7d2u4agr7wcm3zwvpu2qzk6yjjxpqvfjc6l';

function action(event: Record<string, unknown>): Record<string, unknown> {
  return { actionId: POST_DETAIL_ACTION.id, event, status: 'ok' };
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

describe('postActionPath', () => {
  it('opens the post itself for a note', () => {
    expect(postActionPath(action({ id: HEX, kind: 1 }))).toBe(postPath(HEX));
  });

  it('opens the post itself when the kind is unknown', () => {
    expect(postActionPath(action({ id: HEX }))).toBe(postPath(HEX));
    expect(postActionPath(action({ id: HEX, kind: 30023 }))).toBe(postPath(HEX));
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
      expect(postActionPath(action(event))).toBe(postPath(OTHER_HEX));
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
    expect(postActionPath(action(event))).toBe(postPath(OTHER_HEX));
  });

  it('falls back to the event itself when there is no e tag', () => {
    expect(postActionPath(action({ id: HEX, kind: 7, tags: [['p', OTHER_HEX]] }))).toBe(
      postPath(HEX)
    );
    expect(postActionPath(action({ id: HEX, kind: 7 }))).toBe(postPath(HEX));
  });

  it('ignores another action', () => {
    expect(postActionPath({ actionId: 'like', event: { id: HEX, kind: 1 } })).toBeNull();
    expect(postActionPath({ event: { id: HEX, kind: 1 } })).toBeNull();
  });

  it('ignores a detail it cannot read an event id out of', () => {
    expect(postActionPath(action({ kind: 1 }))).toBeNull();
    expect(postActionPath(action({ id: '', kind: 1 }))).toBeNull();
    expect(postActionPath(action({ id: 42, kind: 1 }))).toBeNull();
    expect(postActionPath({ actionId: POST_DETAIL_ACTION.id })).toBeNull();
    expect(postActionPath({ actionId: POST_DETAIL_ACTION.id, event: null })).toBeNull();
    expect(postActionPath(null)).toBeNull();
    expect(postActionPath(undefined)).toBeNull();
    expect(postActionPath('detail')).toBeNull();
    expect(postActionPath([])).toBeNull();
  });
});
