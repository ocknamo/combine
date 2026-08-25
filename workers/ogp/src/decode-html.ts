/**
 * Turning fetched bytes into text we can scan for metadata.
 *
 * `Response.text()` would decode everything as UTF-8. That is right for most of
 * the web and wrong for exactly the pages this app's users link to most often:
 * older Japanese sites still serve Shift_JIS or EUC-JP, and read as UTF-8 their
 * title is mojibake — worse than no card at all.
 */

/** Bytes sniffed for a `<meta charset>` before any decoding has happened. */
const SNIFF_BYTES = 2048;

const ASCII = new TextDecoder('utf-8');

function charsetFromContentType(contentType: string | null): string | null {
  if (!contentType) return null;
  const match = /charset\s*=\s*"?([\w-]+)"?/i.exec(contentType);
  return match ? match[1] : null;
}

function charsetFromMarkup(head: string): string | null {
  const meta = /<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i.exec(head);
  return meta ? meta[1] : null;
}

/**
 * The declared encoding, header first and markup second — the order the HTML
 * spec puts them in.
 */
export function detectCharset(bytes: Uint8Array, contentType: string | null): string | null {
  return (
    charsetFromContentType(contentType) ??
    charsetFromMarkup(ASCII.decode(bytes.subarray(0, SNIFF_BYTES)))
  );
}

/**
 * Decode a document, honouring its declared encoding where the runtime can.
 *
 * Falls back to UTF-8 for an unknown or unsupported label rather than failing:
 * the Workers runtime does not implement every label in the encoding spec, and
 * a mojibake title is still a better answer than a 500.
 */
export function decodeHtml(bytes: Uint8Array, contentType: string | null): string {
  const charset = detectCharset(bytes, contentType);
  if (charset && charset.toLowerCase() !== 'utf-8') {
    try {
      return new TextDecoder(charset).decode(bytes);
    } catch {
      // Unsupported label — fall through to UTF-8.
    }
  }
  return ASCII.decode(bytes);
}
