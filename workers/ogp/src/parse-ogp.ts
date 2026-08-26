/**
 * Pulling OGP metadata out of a page's HTML.
 *
 * Pure string work on purpose: no DOM, no HTMLRewriter, nothing from the
 * Workers runtime. That keeps the interesting half of this API testable with
 * the app's own `npm run test` (plain vitest on Node), and it is the half worth
 * testing — real pages get the tags wrong in every way a regex has to survive.
 *
 * A tolerant parse is the right trade here. A page whose markup we cannot make
 * sense of should degrade to "no card" for that field, never to an error: the
 * caller is drawing a link preview, and a missing description is not a failure.
 */

export interface OgpMetadata {
  /** The page's own canonical URL, or the URL actually fetched. */
  url: string;
  title: string | null;
  description: string | null;
  /** Absolute URL, resolved against the page. */
  image: string | null;
  imageAlt: string | null;
  siteName: string | null;
  /** `og:type`, e.g. `article`. Not the content type of the response. */
  type: string | null;
}

/**
 * Attributes of one tag. Values are entity-decoded; keys are lowercased, since
 * HTML attribute names are case-insensitive and pages spell `property` and
 * `Property` alike.
 */
type Attributes = Record<string, string>;

/**
 * How much of each field is worth passing on.
 *
 * A page's `content=` is unbounded and written by whoever wrote the page, so
 * something has to bound it — and the ceiling that matters is the reader's, not
 * ours. nostr-cache's client *rejects* any field over 4096 characters outright
 * rather than clipping it, and drops a whole response body over 64K, so an
 * article with a runaway `og:title` would otherwise cost the card entirely.
 * These sit above what any consumer renders (that client shows 200 / 400 / 100)
 * and far below where it starts refusing things.
 */
const LIMITS = {
  title: 300,
  description: 1000,
  siteName: 200,
  imageAlt: 300,
  type: 100,
  /** URLs are dropped rather than clipped — half a URL points nowhere. */
  url: 2048,
} as const;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
};

/**
 * One numeric character reference, or `null` when it names no character.
 *
 * `String.fromCodePoint` throws above U+10FFFF, and the number in a `&#…;` is
 * whatever the page wrote — so it is checked rather than trusted. Anything out
 * of range is left as written, the same as an unknown named entity.
 */
function fromCodePoint(code: number): string | null {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return null;
  return String.fromCodePoint(code);
}

/**
 * Decode the entities that actually show up in title and description text.
 *
 * Not a full entity table: everything beyond these is rare in metadata, and an
 * unknown entity is left as written rather than mangled.
 */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
    const key = name.toLowerCase();
    if (key.startsWith('#x')) return fromCodePoint(Number.parseInt(key.slice(2), 16)) ?? match;
    if (key.startsWith('#')) return fromCodePoint(Number.parseInt(key.slice(1), 10)) ?? match;
    return NAMED_ENTITIES[key] ?? match;
  });
}

/**
 * Collapse the whitespace a hand-wrapped `content=` attribute carries, and clip
 * the result to what a card can use.
 *
 * The ellipsis is deliberate: a consumer that clips again should be clipping
 * text that already says it was cut, not silently losing the difference.
 */
function clean(value: string | undefined, max = Number.POSITIVE_INFINITY): string | null {
  if (value === undefined) return null;
  const text = decodeEntities(value).replace(/\s+/g, ' ').trim();
  if (text === '') return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

const ATTRIBUTE = /([a-z_:][-a-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;

function attributes(tag: string): Attributes {
  const found: Attributes = {};
  ATTRIBUTE.lastIndex = 0;
  let match = ATTRIBUTE.exec(tag);
  while (match !== null) {
    found[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
    match = ATTRIBUTE.exec(tag);
  }
  return found;
}

/**
 * The part of the document worth scanning.
 *
 * Cut at `</head>` when there is one: metadata belongs there, and stopping
 * early keeps a body full of user text (which may quote `<meta` verbatim) out
 * of the match. Script and style bodies go too, for the same reason — inline
 * JSON-LD and templates routinely contain tag-shaped strings.
 */
function metadataSection(html: string): string {
  const headEnd = html.search(/<\/head\s*>/i);
  const section = headEnd === -1 ? html : html.slice(0, headEnd);
  return section.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ');
}

/** Resolve a possibly relative URL, dropping anything that will not parse. */
function absolute(value: string | null, base: string): string | null {
  if (value === null) return null;
  try {
    const { href } = new URL(value, base);
    return href.length > LIMITS.url ? null : href;
  } catch {
    return null;
  }
}

/**
 * Read a page's metadata.
 *
 * `og:*` wins, then `twitter:*`, then the plain HTML the tags were invented to
 * replace — a page with only `<title>` still gets a usable card. The first
 * occurrence of a property wins, matching how consumers generally read these:
 * a page that repeats `og:image` for several sizes leads with the one it wants
 * shown.
 *
 * @param html The document text, already decoded to a string.
 * @param fetchedUrl The URL the HTML came from, after redirects. Relative URLs
 *   resolve against it, and it is the fallback for `url`.
 */
export function parseOgp(html: string, fetchedUrl: string): OgpMetadata {
  const section = metadataSection(html);

  const og: Attributes = {};
  const twitter: Attributes = {};
  let metaDescription: string | undefined;

  const tags = section.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const attrs = attributes(tag);
    const content = attrs['content'];
    if (content === undefined) continue;

    // `property` is what OGP specifies; plenty of pages (and every CMS that
    // treats these as ordinary metadata) use `name` instead, for both vocabularies.
    const key = (attrs['property'] ?? attrs['name'] ?? '').toLowerCase();
    if (key === '') continue;

    if (key.startsWith('og:')) {
      og[key] ??= content;
    } else if (key.startsWith('twitter:')) {
      twitter[key] ??= content;
    } else if (key === 'description') {
      metaDescription ??= content;
    }
  }

  const titleTag = /<title[^>]*>([\s\S]*?)<\/title\s*>/i.exec(section);
  const canonical = section
    .match(/<link\b[^>]*>/gi)
    ?.map(attributes)
    .find((attrs) => (attrs['rel'] ?? '').toLowerCase().split(/\s+/).includes('canonical'));

  const title =
    clean(og['og:title'], LIMITS.title) ??
    clean(twitter['twitter:title'], LIMITS.title) ??
    clean(titleTag?.[1], LIMITS.title);
  const description =
    clean(og['og:description'], LIMITS.description) ??
    clean(twitter['twitter:description'], LIMITS.description) ??
    clean(metaDescription, LIMITS.description);
  // URL candidates go in unclipped: `absolute` drops one that is too long
  // rather than passing on a truncated address that still parses.
  const image =
    clean(og['og:image:secure_url']) ??
    clean(og['og:image:url']) ??
    clean(og['og:image']) ??
    clean(twitter['twitter:image']) ??
    clean(twitter['twitter:image:src']);

  return {
    url: absolute(clean(og['og:url']) ?? clean(canonical?.['href']), fetchedUrl) ?? fetchedUrl,
    title,
    description,
    image: absolute(image, fetchedUrl),
    imageAlt:
      clean(og['og:image:alt'], LIMITS.imageAlt) ??
      clean(twitter['twitter:image:alt'], LIMITS.imageAlt),
    siteName: clean(og['og:site_name'], LIMITS.siteName),
    type: clean(og['og:type'], LIMITS.type),
  };
}
