import { describe, expect, it } from 'vitest';
import {
  clearEhagakiStorage,
  composerHeight,
  createComposer,
  describeFailure,
  EHAGAKI_ASSET_BASE,
  EHAGAKI_AUTO_LOGIN_ATTRIBUTE,
  EHAGAKI_ORIGIN,
  EHAGAKI_SCRIPT_URL,
  EHAGAKI_SETTINGS,
  EHAGAKI_STORAGE_PREFIX,
  EHAGAKI_TAG,
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

/** The element as far as {@link createComposer} touches it — there is no DOM here. */
function fakeDocument() {
  const attributes = new Map<string, string>();
  const element = {
    assetBase: null as string | null,
    setAttribute: (name: string, value: string) => void attributes.set(name, value),
  };
  const created: string[] = [];
  return {
    attributes,
    element,
    created,
    doc: {
      createElement: (tag: string) => {
        created.push(tag);
        return element as unknown as HTMLElement;
      },
    } as Pick<Document, 'createElement'>,
  };
}

describe('createComposer', () => {
  it('points the element at the bundle it was loaded from', () => {
    const { doc, element, created } = fakeDocument();
    createComposer(doc);
    expect(created).toEqual([EHAGAKI_TAG]);
    expect(element.assetBase).toBe(EHAGAKI_ASSET_BASE);
  });

  // Before it is connected, because the element reads the attribute when it
  // mounts. Without it the user taps through eHagaki's login dialog on the
  // first visit, and again after every account switch.
  it('opts into NIP-07 auto-login', () => {
    const { doc, attributes } = fakeDocument();
    createComposer(doc);
    expect(attributes.has(EHAGAKI_AUTO_LOGIN_ATTRIBUTE)).toBe(true);
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
  const page = { hostTop: 50, hostHeight: 600, layoutHeight: 700 };
  const noKeyboard = { height: 0 };

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

  it('takes the keyboard out of the viewport when the viewport does not shrink', () => {
    // Android Chrome once eHagaki has opted the page into overlaying the
    // keyboard: `visualViewport` still reports the full 700, and the only thing
    // that knows a keyboard is up is its rectangle. 300 of keyboard at the
    // bottom of 700 puts its top at 400.
    expect(
      composerHeight({
        ...page,
        viewport: { offsetTop: 0, height: 700 },
        keyboard: { height: 300 },
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

  it('ignores a keyboard taller than the viewport it is docked in', () => {
    // Whatever such a rectangle means, it is not a keyboard, and subtracting it
    // would leave the editor pinned at its minimum with the post button under
    // the keyboard — the failure this is here to avoid.
    expect(
      composerHeight({
        ...page,
        viewport: { offsetTop: 0, height: 700 },
        keyboard: { height: 900 },
      })
    ).toBe(600);
  });

  it('is unmoved by where the keyboard rectangle claims to be', () => {
    // The reported bug: on the device that hit it the rectangle sat far above
    // the keyboard's real top, which took the editor down to its minimum with
    // 371px free. Only the height is read now, so the offset cannot land.
    expect(
      composerHeight({
        hostTop: 90.7,
        hostHeight: 618,
        layoutHeight: 808,
        viewport: { offsetTop: 0, height: 808 },
        keyboard: { height: 346.3 },
      })
    ).toBeCloseTo(371, 0);
  });

  it('takes the lower bottom when both signals report one', () => {
    // Nothing says the two have to agree, and the editor's footer has to clear
    // whichever of them is right.
    expect(
      composerHeight({
        ...page,
        viewport: { offsetTop: 0, height: 500 },
        keyboard: { height: 300 },
      })
    ).toBe(350);
  });

  it('keeps the element bottom on the keyboard as the page scrolls under it', () => {
    // A scroll moves the host box in client coordinates; the keyboard, docked
    // to the viewport, does not move with it. 120 of scroll puts the host box
    // at -70, and the element still has to end at the keyboard's top (400).
    expect(
      composerHeight({
        ...page,
        hostTop: 50 - 120,
        viewport: { offsetTop: 0, height: 700 },
        keyboard: { height: 300 },
      })
    ).toBe(470);
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
