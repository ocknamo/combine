import { describe, expect, it } from 'vitest';
import { decodeBech32, toHexPubkey, toNevent, toNote, toNpub } from './nip19';

// Test vector from NIP-19
const NPUB = 'npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg';
const HEX = '7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e';

describe('toHexPubkey', () => {
  it('decodes npub to hex', () => {
    expect(toHexPubkey(NPUB)).toBe(HEX);
  });

  it('passes through 64-char hex', () => {
    expect(toHexPubkey(HEX)).toBe(HEX);
    expect(toHexPubkey(HEX.toUpperCase())).toBe(HEX);
  });

  it('rejects invalid input', () => {
    expect(toHexPubkey('hello')).toBeNull();
    expect(
      toHexPubkey('npub1invalidchecksumxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
    ).toBeNull();
    expect(
      toHexPubkey('note1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq')
    ).toBeNull();
  });

  it('decodes nprofile to hex', () => {
    // nprofile from NIP-19 example (pubkey + 2 relays)
    const nprofile =
      'nprofile1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cgukyawd24mayt8gpp4mhxue69uhhytnc9e3k7mgpz4mhxue69uhkg6nzv9ejuumpv34kytnrdaksjlyr9p';
    expect(toHexPubkey(nprofile)).toBe(
      '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d'
    );
  });
});

describe('toNpub', () => {
  it('encodes hex to npub (round trip)', () => {
    expect(toNpub(HEX)).toBe(NPUB);
  });

  it('rejects invalid hex', () => {
    expect(toNpub('xyz')).toBeNull();
  });
});

describe('toNote', () => {
  it('encodes a hex event id', () => {
    const note = toNote(HEX);
    expect(note?.startsWith('note1')).toBe(true);
    const decoded = decodeBech32(note ?? '');
    expect(decoded?.prefix).toBe('note');
    expect([...(decoded?.bytes ?? [])].map((b) => b.toString(16).padStart(2, '0')).join('')).toBe(
      HEX
    );
  });

  it('rejects anything that is not a 64-char hex id', () => {
    expect(toNote('xyz')).toBeNull();
    expect(toNote(HEX.slice(0, 63))).toBeNull();
    expect(toNote('')).toBeNull();
  });
});

describe('toNevent', () => {
  const AUTHOR = 'b'.repeat(64);

  /** The TLV records of a decoded nevent, as `{ type, value }`. */
  function records(nevent: string): { type: number; value: number[] }[] {
    const bytes = [...(decodeBech32(nevent)?.bytes ?? [])];
    const out: { type: number; value: number[] }[] = [];
    let i = 0;
    while (i + 2 <= bytes.length) {
      const length = bytes[i + 1];
      out.push({ type: bytes[i], value: bytes.slice(i + 2, i + 2 + length) });
      i += 2 + length;
    }
    return out;
  }

  it('carries the id, the author and one relay hint', () => {
    const nevent = toNevent(HEX, {
      author: AUTHOR,
      relays: ['wss://a.example', 'wss://b.example'],
    });
    expect(nevent?.startsWith('nevent1')).toBe(true);
    const tlv = records(nevent ?? '');
    expect(tlv.map((r) => r.type)).toEqual([0, 1, 2]);
    expect(tlv[0].value.map((b) => b.toString(16).padStart(2, '0')).join('')).toBe(HEX);
    expect(new TextDecoder().decode(Uint8Array.from(tlv[1].value))).toBe('wss://a.example');
    expect(tlv[2].value.map((b) => b.toString(16).padStart(2, '0')).join('')).toBe(AUTHOR);
  });

  it('falls back to note when there is no hint to carry', () => {
    expect(toNevent(HEX)).toBe(toNote(HEX));
    expect(toNevent(HEX, { author: null, relays: [] })).toBe(toNote(HEX));
    // An author that is not a pubkey is no hint either.
    expect(toNevent(HEX, { author: 'nope' })).toBe(toNote(HEX));
  });

  it('rejects an id that is not hex', () => {
    expect(toNevent('note1xyz', { author: AUTHOR })).toBeNull();
  });
});

describe('decodeBech32', () => {
  it('returns the prefix', () => {
    expect(decodeBech32(NPUB)?.prefix).toBe('npub');
  });
});
