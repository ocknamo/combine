import { describe, expect, it } from 'vitest';
import { decodeEntities, parseOgp } from './parse-ogp';

const BASE = 'https://example.com/articles/1';

function page(head: string, body = ''): string {
  return `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
}

describe('parseOgp', () => {
  it('reads the Open Graph tags', () => {
    const html = page(`
      <meta property="og:title" content="タイトル">
      <meta property="og:description" content="説明">
      <meta property="og:image" content="https://cdn.example.com/a.png">
      <meta property="og:site_name" content="Example">
      <meta property="og:type" content="article">
      <meta property="og:url" content="https://example.com/canonical">
    `);
    expect(parseOgp(html, BASE)).toEqual({
      url: 'https://example.com/canonical',
      title: 'タイトル',
      description: '説明',
      image: 'https://cdn.example.com/a.png',
      imageAlt: null,
      siteName: 'Example',
      type: 'article',
    });
  });

  it('falls back to twitter tags, then to plain HTML', () => {
    const twitter = parseOgp(
      page(`
        <title>ignored</title>
        <meta name="twitter:title" content="ツイート用">
        <meta name="twitter:description" content="tw desc">
        <meta name="twitter:image" content="/tw.png">
      `),
      BASE
    );
    expect(twitter.title).toBe('ツイート用');
    expect(twitter.description).toBe('tw desc');
    expect(twitter.image).toBe('https://example.com/tw.png');

    const plain = parseOgp(
      page('<title>ただのタイトル</title><meta name="description" content="ただの説明">'),
      BASE
    );
    expect(plain.title).toBe('ただのタイトル');
    expect(plain.description).toBe('ただの説明');
    expect(plain.image).toBeNull();
    // No canonical anywhere: the URL fetched is the answer.
    expect(plain.url).toBe(BASE);
  });

  it('resolves relative images and the canonical link against the page', () => {
    const metadata = parseOgp(
      page(`
        <link rel="canonical" href="/articles/1?utm=x">
        <meta property="og:image" content="../img/hero.jpg">
      `),
      BASE
    );
    expect(metadata.url).toBe('https://example.com/articles/1?utm=x');
    expect(metadata.image).toBe('https://example.com/img/hero.jpg');
  });

  it('keeps the first value when a property repeats', () => {
    const metadata = parseOgp(
      page(`
        <meta property="og:image" content="https://cdn.example.com/first.png">
        <meta property="og:image" content="https://cdn.example.com/second.png">
      `),
      BASE
    );
    expect(metadata.image).toBe('https://cdn.example.com/first.png');
  });

  it('survives the markup real pages ship', () => {
    const metadata = parseOgp(
      page(
        `<meta charset=utf-8>
         <meta PROPERTY='og:title' CONTENT='単引用 &amp; 大文字'  />
         <meta property="og:image:secure_url" content="https://cdn.example.com/secure.png">
         <meta property="og:description" content="改行を
         含む   説明">`
      ),
      BASE
    );
    expect(metadata.title).toBe('単引用 & 大文字');
    expect(metadata.image).toBe('https://cdn.example.com/secure.png');
    expect(metadata.description).toBe('改行を 含む 説明');
  });

  it('ignores tag-shaped text in scripts and in the body', () => {
    const html = page(
      `<title>本物</title>
       <script type="application/ld+json">{"html":"<meta property=\\"og:title\\" content=\\"偽物\\">"}</script>`,
      '<meta property="og:title" content="本文の偽物">'
    );
    expect(parseOgp(html, BASE).title).toBe('本物');
  });

  it('clips a field to what a card can use, and says it clipped', () => {
    // The consumer's limit is the one that matters: nostr-cache's widget throws
    // out a field over 4096 characters rather than clipping it, so a runaway
    // title has to be cut here or it costs the whole card.
    const metadata = parseOgp(
      page(`
        <meta property="og:title" content="${'あ'.repeat(5000)}">
        <meta property="og:description" content="${'い'.repeat(5000)}">
        <meta property="og:site_name" content="${'う'.repeat(500)}">
      `),
      BASE
    );
    expect(metadata.title).toBe(`${'あ'.repeat(300)}…`);
    expect(metadata.description).toBe(`${'い'.repeat(1000)}…`);
    expect(metadata.siteName).toBe(`${'う'.repeat(200)}…`);
  });

  it('drops an absurdly long URL rather than half of one', () => {
    const long = `https://cdn.example.com/${'a'.repeat(3000)}.png`;
    const metadata = parseOgp(page(`<meta property="og:image" content="${long}">`), BASE);
    // Clipping would leave an address that still parses and points elsewhere.
    expect(metadata.image).toBeNull();
  });

  it('drops an empty value rather than inventing one', () => {
    const metadata = parseOgp(
      page('<meta property="og:title" content="   "><meta property="og:image" content="">'),
      BASE
    );
    expect(metadata.title).toBeNull();
    expect(metadata.image).toBeNull();
  });
});

describe('decodeEntities', () => {
  it('decodes the entities metadata actually carries', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39; &#x3042;')).toBe(
      'a & b <c> "d" \'e\' あ'
    );
  });

  it('leaves an unknown entity as written', () => {
    expect(decodeEntities('&notanentity; &copy;')).toBe('&notanentity; &copy;');
  });

  it('leaves a code point that names no character alone rather than throwing', () => {
    // `String.fromCodePoint` throws above U+10FFFF, and the number comes from
    // the page — an unparseable title must still cost only the title.
    expect(decodeEntities('&#x110000;')).toBe('&#x110000;');
    expect(decodeEntities('&#4294967295;')).toBe('&#4294967295;');
    expect(parseOgp(page('<meta property="og:title" content="&#x110000;">'), BASE).title).toBe(
      '&#x110000;'
    );
  });
});
