import { describe, expect, it } from 'vitest';
import {
  clearEhagakiStorage,
  composerBox,
  describeFailure,
  EHAGAKI_ASSET_BASE,
  EHAGAKI_ORIGIN,
  EHAGAKI_SCRIPT_URL,
  EHAGAKI_SETTINGS,
  EHAGAKI_STORAGE_PREFIX,
  isDisconnected,
  KEYBOARD_THRESHOLD,
  MIN_COMPOSER_HEIGHT,
  postErrorMessage,
  shieldDexieRegistry,
} from './ehagakiComposer';

/** Enough of the Storage interface for {@link clearEhagakiStorage}. */
function fakeStorage(entries: Record<string, string>): Storage {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  } as Storage;
}

describe('bundle location', () => {
  it('loads the Web Component build from the eHagaki origin', () => {
    expect(new URL(EHAGAKI_SCRIPT_URL).origin).toBe(EHAGAKI_ORIGIN);
  });

  it('points asset-base at the directory the script sits in', () => {
    expect(EHAGAKI_SCRIPT_URL.startsWith(EHAGAKI_ASSET_BASE)).toBe(true);
    expect(EHAGAKI_ASSET_BASE.endsWith('/')).toBe(true);
  });
});

describe('EHAGAKI_SETTINGS', () => {
  it('keeps the Japanese locale and client tag the iframe was given', () => {
    expect(EHAGAKI_SETTINGS.locale).toBe('ja');
    expect(EHAGAKI_SETTINGS.clientTagEnabled).toBe(true);
  });

  it('pins the editor to light, since combine has no dark theme', () => {
    expect(EHAGAKI_SETTINGS.themeMode).toBe('light');
  });
});

describe('postErrorMessage', () => {
  it('says nothing for an empty post, which the editor reports itself', () => {
    expect(postErrorMessage('empty_content')).toBeNull();
  });

  it('translates the codes it knows', () => {
    expect(postErrorMessage('login_required')).toContain('ログイン');
  });

  it('still shows an unknown code rather than swallowing the failure', () => {
    expect(postErrorMessage('something_new')).toContain('something_new');
  });
});

describe('clearEhagakiStorage', () => {
  it('removes the composer keys and leaves combine alone', () => {
    const storage = fakeStorage({
      [`${EHAGAKI_STORAGE_PREFIX}draft`]: 'x',
      [`${EHAGAKI_STORAGE_PREFIX}auth`]: 'y',
      'combine:pubkey': 'z',
    });
    clearEhagakiStorage(storage);
    expect(storage.getItem(`${EHAGAKI_STORAGE_PREFIX}draft`)).toBeNull();
    expect(storage.getItem(`${EHAGAKI_STORAGE_PREFIX}auth`)).toBeNull();
    expect(storage.getItem('combine:pubkey')).toBe('z');
  });
});

/** A phone-sized page: the header takes the first 50px, the tab bar the last. */
function scene(over: {
  hostTop?: number;
  hostHeight?: number;
  offsetTop?: number;
  height?: number;
  scale?: number;
  layoutHeight?: number;
  viewport?: null;
}) {
  const layoutHeight = over.layoutHeight ?? 700;
  return {
    host: {
      top: over.hostTop ?? 50,
      left: 0,
      width: 390,
      height: over.hostHeight ?? 600,
    },
    viewport:
      over.viewport === null
        ? null
        : {
            offsetTop: over.offsetTop ?? 0,
            height: over.height ?? layoutHeight,
            scale: over.scale ?? 1,
          },
    layoutHeight,
  };
}

describe('composerBox', () => {
  it('takes the host box height when the whole page is visible', () => {
    expect(composerBox(scene({}))).toEqual({ mode: 'flow', height: 600 });
  });

  it('falls back to the host box without a visual viewport', () => {
    expect(composerBox(scene({ viewport: null }))).toEqual({ mode: 'flow', height: 600 });
  });

  it('stays in flow for the small bites browser chrome takes, capped at the visible bottom', () => {
    // An accessory bar or a collapsing address bar: not a keyboard, but the
    // footer still has to stay above it.
    const box = composerBox(scene({ height: 700 - KEYBOARD_THRESHOLD + 10 }));
    expect(box).toEqual({ mode: 'flow', height: 700 - KEYBOARD_THRESHOLD + 10 - 50 });
  });

  it('never shrinks past the minimum while in flow', () => {
    expect(composerBox(scene({ hostHeight: 100 }))).toEqual({
      mode: 'flow',
      height: MIN_COMPOSER_HEIGHT,
    });
  });

  it('pins to the visible rectangle once a keyboard is up', () => {
    // 700 of layout viewport, 400 of it visible: the keyboard has 300.
    expect(composerBox(scene({ height: 400 }))).toEqual({
      mode: 'pinned',
      top: 0,
      left: 0,
      width: 390,
      height: 400,
    });
  });

  it('follows the visual viewport when the keyboard scrolled it', () => {
    const box = composerBox(scene({ height: 400, offsetTop: 120 }));
    expect(box).toEqual({ mode: 'pinned', top: 120, left: 0, width: 390, height: 400 });
  });

  it('pins to what is visible even when the page scrolled the host box away', () => {
    // The case a height alone cannot fix: the browser scrolled the document to
    // reveal the caret, so the host box no longer starts where the screen does.
    const box = composerBox(scene({ hostTop: -180, height: 400 }));
    expect(box).toEqual({ mode: 'pinned', top: 0, left: 0, width: 390, height: 400 });
  });

  it('gives the visible height verbatim, minimum included, so the footer clears the keyboard', () => {
    const box = composerBox(scene({ height: MIN_COMPOSER_HEIGHT - 40 }));
    expect(box).toEqual({
      mode: 'pinned',
      top: 0,
      left: 0,
      width: 390,
      height: MIN_COMPOSER_HEIGHT - 40,
    });
  });

  it('reads a pinch-zoomed viewport as zoom, not as a keyboard', () => {
    // Zooming shrinks the visible area the same way; pinning to it would fight
    // the user's panning.
    const box = composerBox(scene({ height: 350, scale: 2 }));
    expect(box).toEqual({ mode: 'flow', height: 300 });
  });
});

describe('describeFailure', () => {
  it("uses the element's error name, which carries its code", () => {
    const error = new Error('Only one ehagaki-composer can be connected in a document.');
    error.name = 'multiple_instances_unsupported';
    expect(describeFailure(error)).toContain('multiple_instances_unsupported');
  });

  it('leaves a plain error as its message', () => {
    expect(describeFailure(new TypeError('Failed to fetch dynamically imported module'))).toBe(
      'TypeError: Failed to fetch dynamically imported module'
    );
  });

  it('says something for a thrown non-error', () => {
    expect(describeFailure('boom')).toBe('boom');
  });
});

describe('isDisconnected', () => {
  it('recognises the rejection whenReady gives a torn-down element', () => {
    const error = new Error('Component was disconnected before it became ready.');
    error.name = 'disconnected';
    expect(isDisconnected(error)).toBe(true);
  });

  it('does not mistake another failure for it', () => {
    const error = new Error('eHagaki Composer could not be initialized.');
    error.name = 'initialization_failed';
    expect(isDisconnected(error)).toBe(false);
  });
});

describe('shieldDexieRegistry', () => {
  const DEXIE = Symbol.for('Dexie');

  it('reads empty while shielded, so a second copy registers instead of throwing', () => {
    const page: { [key: symbol]: unknown } = { [DEXIE]: { semVer: '4.4.4' } };
    const restore = shieldDexieRegistry(page);
    // What Dexie itself does on load: take what is there, or claim the slot.
    const mine = { semVer: '4.4.2' };
    let shared = page[DEXIE];
    if (shared === undefined) {
      page[DEXIE] = mine;
      shared = mine;
    }
    expect(shared).toBe(mine);
    restore();
  });

  it('gives the slot back to whoever held it', () => {
    const relay = { semVer: '4.4.4' };
    const page: { [key: symbol]: unknown } = { [DEXIE]: relay };
    const restore = shieldDexieRegistry(page);
    page[DEXIE] = { semVer: '4.4.2' };
    restore();
    expect(page[DEXIE]).toBe(relay);
  });

  it('keeps the first claim made while shielded when the slot started empty', () => {
    const page: { [key: symbol]: unknown } = {};
    const restore = shieldDexieRegistry(page);
    const first = { semVer: '4.4.4' };
    page[DEXIE] = first;
    page[DEXIE] = { semVer: '4.4.2' };
    restore();
    expect(page[DEXIE]).toBe(first);
  });

  it('leaves an empty slot empty when nobody claims it', () => {
    const page: { [key: symbol]: unknown } = {};
    shieldDexieRegistry(page)();
    expect(DEXIE in page).toBe(false);
  });
});
