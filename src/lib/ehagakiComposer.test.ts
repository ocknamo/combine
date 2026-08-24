import { describe, expect, it } from 'vitest';
import {
  clearEhagakiStorage,
  composerHeight,
  describeFailure,
  EHAGAKI_ASSET_BASE,
  EHAGAKI_ORIGIN,
  EHAGAKI_SCRIPT_URL,
  EHAGAKI_SETTINGS,
  EHAGAKI_STORAGE_PREFIX,
  isDisconnected,
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

describe('composerHeight', () => {
  /** 700 of layout viewport, the host box running from y=50 to y=650. */
  const page = { hostTop: 50, hostHeight: 600 };
  const noKeyboard = { top: 0, height: 0 };

  it('takes the host box height when the whole page is visible', () => {
    expect(
      composerHeight({
        ...page,
        viewport: { offsetTop: 0, height: 700 },
        keyboard: null,
      })
    ).toBe(600);
  });

  it('falls back to the host box with neither signal', () => {
    expect(composerHeight({ ...page, viewport: null, keyboard: null })).toBe(600);
  });

  it('caps at the visible bottom when the visual viewport shrinks', () => {
    // iOS with the keyboard open: the page keeps its height, the visible part
    // ends at 400 while the host box still claims to run to 650.
    expect(
      composerHeight({
        ...page,
        viewport: { offsetTop: 0, height: 400 },
        keyboard: null,
      })
    ).toBe(350);
  });

  it("caps at the keyboard's own top when the viewport does not shrink", () => {
    // Android Chrome once eHagaki has opted the page into overlaying the
    // keyboard: `visualViewport` still reports the full 700, and the only thing
    // that knows a keyboard is up is its rectangle.
    expect(
      composerHeight({
        ...page,
        viewport: { offsetTop: 0, height: 700 },
        keyboard: { top: 400, height: 300 },
      })
    ).toBe(350);
  });

  it('ignores a zero-height keyboard rectangle, which means no keyboard', () => {
    expect(
      composerHeight({
        ...page,
        viewport: { offsetTop: 0, height: 400 },
        keyboard: noKeyboard,
      })
    ).toBe(350);
  });

  it('prefers the keyboard rectangle when both signals report one', () => {
    // Nothing says the two have to agree; the keyboard's own geometry is the
    // one that was measured rather than inferred.
    expect(
      composerHeight({
        ...page,
        viewport: { offsetTop: 0, height: 500 },
        keyboard: { top: 400, height: 300 },
      })
    ).toBe(350);
  });

  it('is unaffected by the page scrolling under an open keyboard', () => {
    // Both edges are in the same client coordinates, so a scroll that moves the
    // host box moves the keyboard's rectangle with it.
    expect(
      composerHeight({
        hostTop: 50 - 120,
        hostHeight: 600,
        viewport: { offsetTop: 0, height: 700 },
        keyboard: { top: 400 - 120, height: 300 },
      })
    ).toBe(350);
  });

  it('never shrinks past the minimum, however little is visible', () => {
    expect(
      composerHeight({
        ...page,
        viewport: { offsetTop: 0, height: 100 },
        keyboard: null,
      })
    ).toBe(MIN_COMPOSER_HEIGHT);
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
