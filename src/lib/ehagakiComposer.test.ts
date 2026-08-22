import { describe, expect, it } from 'vitest';
import {
  clearEhagakiStorage,
  composerHeight,
  EHAGAKI_ASSET_BASE,
  EHAGAKI_ORIGIN,
  EHAGAKI_SCRIPT_URL,
  EHAGAKI_SETTINGS,
  EHAGAKI_STORAGE_PREFIX,
  MIN_COMPOSER_HEIGHT,
  postErrorMessage,
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
  it('takes the host box height when the whole page is visible', () => {
    expect(
      composerHeight({
        hostTop: 50,
        hostHeight: 600,
        viewport: { offsetTop: 0, height: 700 },
      })
    ).toBe(600);
  });

  it('falls back to the host box without a visual viewport', () => {
    expect(composerHeight({ hostTop: 50, hostHeight: 600, viewport: null })).toBe(600);
  });

  it('caps at the visible bottom, so the keyboard cannot cover the footer', () => {
    // iOS with the keyboard open: the page keeps its height, the visible part
    // ends at 400 while the host box still claims to run to 650.
    expect(
      composerHeight({
        hostTop: 50,
        hostHeight: 600,
        viewport: { offsetTop: 0, height: 400 },
      })
    ).toBe(350);
  });

  it('never shrinks past the minimum, however little is visible', () => {
    expect(
      composerHeight({
        hostTop: 50,
        hostHeight: 600,
        viewport: { offsetTop: 0, height: 100 },
      })
    ).toBe(MIN_COMPOSER_HEIGHT);
  });
});
