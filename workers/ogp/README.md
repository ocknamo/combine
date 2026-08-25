# combine-ogp

リンクカード用に OGP メタデータを返す Cloudflare Workers の API。

ブラウザからは任意のサイトの HTML を読めない（CORS）ので、取りに行く役をここに置く。
想定している使われ方は「combine 本体はこのエンドポイントの URL を埋め込み Web Component に
渡すだけで、実際に叩くのはウィジェット側」。**アプリ側の受け渡しはまだ入れていない**ので、
いまのところこの API 単体で完結している（`TODO.md` の「OGP（リンクカード）」参照）。

## API

### `GET /ogp?url=<対象ページの URL>`

`/` でも同じものを返す（ルートに直接デプロイした場合用）。

成功時 `200`:

```json
{
  "requestedUrl": "https://example.com/a",
  "url": "https://example.com/a",
  "title": "記事タイトル",
  "description": "記事の説明",
  "image": "https://example.com/hero.png",
  "imageAlt": null,
  "siteName": "Example",
  "type": "article",
  "fetchedAt": 1756100000
}
```

- 値が取れなかった項目は `null`。**キーは必ず全部入る**ので、受け側は存在チェックではなく
  `null` チェックで書ける。
- `url` はページ自身が主張する URL（`og:url` → `<link rel=canonical>` → 実際に取得した URL）。
  `requestedUrl` はリダイレクト前の、聞かれたままの URL。カードとリンクの対応付けはこちらで取る。
- `image` は相対パスでも絶対 URL に直してから返す。
- OGP タグが 1 つも無いページでも `<title>` と `<meta name=description>` から拾って `200` を返す。
  「カードにする材料が無い」は失敗ではない。

失敗時は `{ "error": "<コード>", "requestedUrl": "…" }`：

| コード | ステータス | 意味 |
| --- | --- | --- |
| `missing_url` / `invalid_url` | 400 | `url` が無い / URL として読めない |
| `unsupported_scheme` | 400 | `http(s)` 以外（`file:` `data:` など） |
| `blocked_host` / `blocked_port` | 403 | プライベート IP・内部名・web 以外のポート |
| `not_found` | 404 | `/ogp` `/` 以外のパス |
| `method_not_allowed` | 405 | `GET` `HEAD` `OPTIONS` 以外 |
| `unsupported_content_type` | 415 | HTML ではない（PDF・画像など） |
| `upstream_error` | 502 | 対象が 4xx/5xx を返した（`status` に元のコード） |
| `fetch_failed` | 502 | 接続できなかった |
| `timeout` | 504 | 6 秒で応答が無かった |

キャッシュヒットは `x-ogp-cache: hit` が付く。

## 安全側の作り

公開・無認証の API が任意の URL を fetch する以上、ここが唯一の歯止めになる。

- **公開 web だけ**。`http(s)` のみ、ポートは 80/443 のみ、`localhost` や `.local` /
  `.internal`、プライベート・リンクローカル・CGNAT・IPv6 のローカル各種は拒否
  （`169.254.169.254` のようなメタデータ endpoint 対策。`src/target-url.ts`）。
  URL に埋まった認証情報は落としてから投げる。
- **HTML だけ・先頭 256 KiB だけ・6 秒だけ**。超過分はストリームを cancel して読まない。
- **CORS は既定で `*`**。自分のオリジンだけに絞るなら `ALLOWED_ORIGINS` を設定する
  （カンマ区切り。設定すると一致したオリジンにだけ `Access-Control-Allow-Origin` を返す）。

名前ベースの判定なので DNS リバインディングまでは防げない。Workers は Cloudflare の
エッジから fetch するので、そもそも社内ネットワークには届かない前提で許容している。

## 設定（`wrangler.jsonc` の `vars`）

| 変数 | 既定 | 説明 |
| --- | --- | --- |
| `CACHE_TTL` | `3600` | 成功レスポンスを保持する秒数（エッジ・ブラウザ共通） |
| `ERROR_CACHE_TTL` | `300` | 失敗を保持する秒数。エッジには保存しない |
| `ALLOWED_ORIGINS` | 未設定（= `*`） | 許可するオリジンのカンマ区切り |
| `USER_AGENT` | `combine-ogp/1.0 …` | 対象サイトに送る UA。UA 次第で OGP を出さないサイトがある |

## 開発

```bash
cd workers/ogp
npm install
npm run dev        # ローカル（http://localhost:8787/ogp?url=… ）
npm run typecheck
npm run deploy     # 要 wrangler login
```

テストはリポジトリのルートで走る（`npm run test`）。ランタイム依存を切ってあるので、
パーサも URL ガードもハンドラ本体も Node の vitest でそのまま動く。
