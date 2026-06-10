/**
 * Minimal NIP-19 (bech32) helpers.
 *
 * Only what the app needs: decoding npub / nprofile to a hex pubkey and
 * encoding a hex pubkey to npub. No external dependencies.
 */

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: number[]): number {
  let chk = 1;
  for (const value of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i++) {
      if ((top >> i) & 1) chk ^= GENERATORS[i];
    }
  }
  return chk;
}

function hrpExpand(hrp: string): number[] {
  const result: number[] = [];
  for (const ch of hrp) result.push(ch.charCodeAt(0) >> 5);
  result.push(0);
  for (const ch of hrp) result.push(ch.charCodeAt(0) & 31);
  return result;
}

function convertBits(data: number[], from: number, to: number, pad: boolean): number[] | null {
  let acc = 0;
  let bits = 0;
  const result: number[] = [];
  const maxValue = (1 << to) - 1;
  for (const value of data) {
    if (value < 0 || value >> from !== 0) return null;
    acc = (acc << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      result.push((acc >> bits) & maxValue);
    }
  }
  if (pad) {
    if (bits > 0) result.push((acc << (to - bits)) & maxValue);
  } else if (bits >= from || (acc << (to - bits)) & maxValue) {
    return null;
  }
  return result;
}

/** Decode a bech32 string into its human readable prefix and data bytes. */
export function decodeBech32(input: string): { prefix: string; bytes: Uint8Array } | null {
  const str = input.toLowerCase();
  const pos = str.lastIndexOf('1');
  if (pos < 1 || pos + 7 > str.length) return null;
  const prefix = str.slice(0, pos);
  const words: number[] = [];
  for (const ch of str.slice(pos + 1)) {
    const v = CHARSET.indexOf(ch);
    if (v === -1) return null;
    words.push(v);
  }
  if (polymod([...hrpExpand(prefix), ...words]) !== 1) return null;
  const bytes = convertBits(words.slice(0, -6), 5, 8, false);
  if (bytes === null) return null;
  return { prefix, bytes: Uint8Array.from(bytes) };
}

/** Encode raw bytes as bech32 with the given prefix. */
export function encodeBech32(prefix: string, bytes: Uint8Array): string {
  const words = convertBits([...bytes], 8, 5, true);
  if (words === null) throw new Error('encodeBech32: invalid data');
  const values = [...hrpExpand(prefix), ...words];
  const mod = polymod([...values, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum: number[] = [];
  for (let i = 0; i < 6; i++) checksum.push((mod >> (5 * (5 - i))) & 31);
  return `${prefix}1${[...words, ...checksum].map((v) => CHARSET[v]).join('')}`;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * Normalize a user identifier (npub / nprofile / 64-char hex) to a hex pubkey.
 * Returns null when the input is not a recognizable pubkey.
 */
export function toHexPubkey(input: string): string | null {
  const value = input.trim();
  if (HEX64.test(value.toLowerCase())) return value.toLowerCase();
  const decoded = decodeBech32(value);
  if (!decoded) return null;
  if (decoded.prefix === 'npub') {
    return decoded.bytes.length === 32 ? bytesToHex(decoded.bytes) : null;
  }
  if (decoded.prefix === 'nprofile') {
    // TLV: type 0 holds the 32-byte pubkey
    const bytes = decoded.bytes;
    let i = 0;
    while (i + 2 <= bytes.length) {
      const type = bytes[i];
      const length = bytes[i + 1];
      if (i + 2 + length > bytes.length) return null;
      if (type === 0 && length === 32) {
        return bytesToHex(bytes.subarray(i + 2, i + 2 + 32));
      }
      i += 2 + length;
    }
    return null;
  }
  return null;
}

/** Encode a hex pubkey as npub. Returns null for invalid input. */
export function toNpub(hexPubkey: string): string | null {
  const value = hexPubkey.trim().toLowerCase();
  if (!HEX64.test(value)) return null;
  return encodeBech32('npub', hexToBytes(value));
}
