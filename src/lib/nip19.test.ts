import { describe, expect, it } from 'vitest';
import { decodeBech32, toHexPubkey, toNpub } from './nip19';

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

describe('decodeBech32', () => {
  it('returns the prefix', () => {
    expect(decodeBech32(NPUB)?.prefix).toBe('npub');
  });
});
