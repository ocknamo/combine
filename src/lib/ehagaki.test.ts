import { describe, expect, it } from 'vitest';
import { buildEhagakiUrl, EHAGAKI_ORIGIN } from './ehagaki';

describe('buildEhagakiUrl', () => {
  it('points at the eHagaki origin and encodes parentOrigin', () => {
    const url = new URL(buildEhagakiUrl('https://example.com'));
    expect(url.origin).toBe(EHAGAKI_ORIGIN);
    expect(url.searchParams.get('parentOrigin')).toBe('https://example.com');
  });

  it('sets Japanese as the default locale', () => {
    const url = new URL(buildEhagakiUrl('http://localhost:5173'));
    expect(url.searchParams.get('defaultLocale')).toBe('ja');
  });
});
