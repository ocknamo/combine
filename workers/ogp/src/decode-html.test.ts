import { describe, expect, it } from 'vitest';
import { decodeHtml, detectCharset } from './decode-html';

const utf8 = new TextEncoder();

/** Shift_JIS 「日本語」, the bytes an older Japanese page would send. */
const SHIFT_JIS = new Uint8Array([0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea]);

describe('detectCharset', () => {
  it('takes the header over the markup, as the HTML spec does', () => {
    const bytes = utf8.encode('<html><head><meta charset="euc-jp">');
    expect(detectCharset(bytes, 'text/html; charset=Shift_JIS')).toBe('Shift_JIS');
    expect(detectCharset(bytes, 'text/html')).toBe('euc-jp');
  });

  it('reads a quoted or bare charset, and reports none when there is none', () => {
    expect(detectCharset(new Uint8Array(), 'text/html; charset="utf-8"')).toBe('utf-8');
    expect(detectCharset(utf8.encode("<meta charset='shift_jis'>"), null)).toBe('shift_jis');
    expect(detectCharset(utf8.encode('<html><head><title>a</title>'), 'text/html')).toBeNull();
  });

  it('does not look past the head for a declaration', () => {
    const late = utf8.encode(`<html><head>${'<!-- x -->'.repeat(300)}<meta charset="shift_jis">`);
    expect(detectCharset(late, null)).toBeNull();
  });
});

describe('decodeHtml', () => {
  it('honours the declared encoding', () => {
    expect(decodeHtml(SHIFT_JIS, 'text/html; charset=Shift_JIS')).toBe('日本語');
    expect(decodeHtml(SHIFT_JIS, null)).not.toBe('日本語'); // undeclared: read as UTF-8
  });

  it('falls back to UTF-8 rather than failing on a label the runtime lacks', () => {
    // A mojibake title still makes a card; a thrown error makes a 500.
    expect(decodeHtml(utf8.encode('日本語'), 'text/html; charset=x-made-up')).toBe('日本語');
  });
});
