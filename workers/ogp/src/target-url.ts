/**
 * What the API is willing to fetch on a caller's behalf.
 *
 * The worker takes a URL from anyone on the internet and fetches it, so this is
 * the only thing standing between the endpoint and being used as an open proxy
 * into somewhere it should not reach. The checks are deliberately
 * conservative — a link in a Nostr note is a public web page, so refusing
 * everything else costs nothing.
 *
 * Name-based checks cannot be airtight (a hostname can resolve to whatever its
 * DNS says, and that resolution happens after this runs), but a Worker fetches
 * from Cloudflare's edge rather than from inside a private network, so the
 * literal forms below are the realistic attempts.
 */

export type TargetUrlError =
  | 'missing_url'
  | 'invalid_url'
  | 'unsupported_scheme'
  | 'blocked_host'
  | 'blocked_port';

export type TargetUrlResult = { ok: true; url: URL } | { ok: false; error: TargetUrlError };

/** Hosts that name the machine running the fetch rather than a public site. */
const BLOCKED_HOSTS = new Set(['localhost', '', '[::]', '0.0.0.0']);

/**
 * Suffixes of names that only resolve inside someone's network, plus `.onion`
 * (which a Worker cannot reach at all — refusing it early keeps the error
 * honest instead of a timeout).
 */
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa', '.onion'];

/**
 * Ports the ordinary web is served on. Anything else on a public host is far
 * more likely to be an internal service than a page with OGP tags.
 */
const ALLOWED_PORTS = new Set(['', '80', '443']);

function isPrivateIPv4(hostname: string): boolean {
  const parts = hostname.split('.');
  if (parts.length !== 4) return false;
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
  if (octets.some((octet) => Number.isNaN(octet) || octet > 255)) return false;

  const [a, b] = octets as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return a >= 224; // multicast and reserved
}

function isPrivateIPv6(hostname: string): boolean {
  if (!hostname.startsWith('[') || !hostname.endsWith(']')) return false;
  const address = hostname.slice(1, -1).toLowerCase();
  if (address === '::1' || address === '::') return true;
  // Unique local (fc00::/7) and link-local (fe80::/10).
  if (/^f[cd]/.test(address)) return true;
  if (/^fe[89ab]/.test(address)) return true;
  // An IPv4 address wearing an IPv6 hat still points where it points. `URL`
  // normalises `::ffff:127.0.0.1` to its hex form, so both spellings are read.
  const dotted = /^::ffff:([\d.]+)$/.exec(address);
  if (dotted) return isPrivateIPv4(dotted[1]);
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(address);
  if (!hex) return false;
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return isPrivateIPv4(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`);
}

/**
 * Parse and vet the `url` query parameter.
 *
 * Returns the parsed URL rather than the raw string so callers work with the
 * normalised form — the same page asked for twice under different spellings
 * then hits the same cache entry.
 */
export function parseTargetUrl(raw: string | null | undefined): TargetUrlResult {
  const value = raw?.trim();
  if (!value) return { ok: false, error: 'missing_url' };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: 'invalid_url' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'unsupported_scheme' };
  }
  if (!ALLOWED_PORTS.has(url.port)) return { ok: false, error: 'blocked_port' };

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname)) return { ok: false, error: 'blocked_host' };
  if (BLOCKED_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return { ok: false, error: 'blocked_host' };
  }
  if (isPrivateIPv4(hostname) || isPrivateIPv6(hostname)) {
    return { ok: false, error: 'blocked_host' };
  }

  // Credentials would be forwarded to the target on our behalf; a link card
  // never needs them.
  url.username = '';
  url.password = '';
  // The fragment never reaches the server anyway, and dropping it keeps two
  // links to the same page on one cache entry.
  url.hash = '';

  return { ok: true, url };
}
