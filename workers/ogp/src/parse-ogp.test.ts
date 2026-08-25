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
});
