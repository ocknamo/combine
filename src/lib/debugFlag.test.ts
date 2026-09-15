import { describe, expect, it } from 'vitest';
import { isDebugEnabled, withDebugFlag } from './debugFlag';

describe('isDebugEnabled', () => {
  it('accepts the documented forms', () => {
    expect(isDebugEnabled('?debug=1')).toBe(true);
    expect(isDebugEnabled('?debug')).toBe(true);
    expect(isDebugEnabled('?debug=true')).toBe(true);
    expect(isDebugEnabled('?debug=TRUE')).toBe(true);
  });

  it('stays off for everything else', () => {
    expect(isDebugEnabled('')).toBe(false);
    expect(isDebugEnabled('?debug=0')).toBe(false);
    expect(isDebugEnabled('?debug=off')).toBe(false);
    expect(isDebugEnabled('?other=1')).toBe(false);
  });

  it('finds the flag among other params', () => {
    expect(isDebugEnabled('?foo=bar&debug=1')).toBe(true);
  });
});

describe('withDebugFlag', () => {
  const IFRAME_URL = 'https://nosskey.app/#/iframe';

  it('adds debug=1 to the search query and keeps the hash route', () => {
    expect(withDebugFlag(IFRAME_URL, true)).toBe('https://nosskey.app/?debug=1#/iframe');
  });

  it('leaves the URL untouched when disabled', () => {
    expect(withDebugFlag(IFRAME_URL, false)).toBe(IFRAME_URL);
  });

  it('does not duplicate an existing flag', () => {
    expect(withDebugFlag('https://nosskey.app/?debug=1#/iframe', true)).toBe(
      'https://nosskey.app/?debug=1#/iframe'
    );
  });

  it('returns the input unchanged when it cannot be parsed', () => {
    expect(withDebugFlag('not a url', true)).toBe('not a url');
    expect(withDebugFlag('', true)).toBe('');
  });
});
