# combine-ogp

リンクカード用に、対象ページの HTML を取ってきて返す Cloudflare Workers の CORS プロキシ。

ブラウザからは任意のサイトの HTML を読めない（CORS）ので、取りに行く役をここに置く。
OGP タグを読むのは**受け側**の仕事——上流 nostr-cache の埋め込みウィジェットが
`ogp-proxy` 属性でこの URL を受け取り、返ってきた HTML を自分で解析してカードを組む
（以前の「Worker が JSON で返す」方式は nostr-cache#89 で廃止された）。

combine 本体はこの URL を `VITE_OGP_PROXY` で受け取り、埋め込みに渡すだけ（`src/lib/nostrCache.ts`）。

## API

### `GET /ogp?url=<対象ページの URL>`

`/` でも同じものを返す（ルートに直接デプロイした場合用）。

成功時 `200`。本文は**対象ページの HTML そのまま**で、ヘッダは:

| ヘッダ | 値 | 理由 |
| --- | --- | --- |
| `content-type` | `text/html; charset=utf-8` | 受け側は `html` を含むかどうかだけを見る。含まなければカードを出さない |
| `cache-control` | `public, max-age=<CACHE_TTL>` | エッジとブラウザ共通 |
| `content-security-policy` | `sandbox` | 他所の HTML を**このオリジンで**配ることになるので、直リンクで開かれても何も動かないようにする。`fetch` + `DOMParser` の読み取りには影響しない |
| `x-content-type-options` | `nosniff` | 宣言した型を勝手に読み替えられないように |
| `referrer-policy` | `no-referrer` | |
| `access-control-allow-origin` | 既定 `*` | 絞るなら `ALLOWED_ORIGINS` |
| `x-ogp-cache` | `hit`（キャッシュヒット時のみ） | |

本文は**常に UTF-8 に直してから**返す。受け側は `content-type` の charset を最優先で見るので、
Shift_JIS や EUC-JP のページをそのまま流すと嘘の charset で読まれて化ける（`src/decode-html.ts`）。

失敗時は `{ "error": "<コード>", "requestedUrl": "…" }` の JSON：

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
| `timeout` | 504 | 4 秒で応答が無かった |

受け側にとってはどの失敗も「HTML ではない＝カード無し」で同じなので、この本文は
`curl` で理由を読むためのもの。

## nostr-cache の埋め込みから使う場合

`<nostr-timeline ogp-proxy="…">`（`nostr-follow-timeline` / `nostr-post` も同じ属性）が
投げてくる形（上流の実装。`packages/timeline-embed/src/lib/ogp.ts`）と、この API の対応関係:

| 埋め込み側 | この API |
| --- | --- |
| `GET {proxy}?url=<対象>`。プロキシ URL が既にクエリを持っていれば `&` で足す（API キー用） | `/ogp?url=…` で受ける。`/` でも同じ |
| `Accept: text/html` / `credentials: omit` / `referrerPolicy: no-referrer` の単純リクエスト | プリフライトは起きない（`OPTIONS` も一応返す） |
| `Access-Control-Allow-Origin` が要る | 既定 `*`。絞るなら `ALLOWED_ORIGINS` |
| `content-type` に `html` を含むこと | `text/html; charset=utf-8` |
| 本文は 256 KiB まで読む | こちらも先頭 256 KiB で打ち切る |
| `content-type` の charset →`<meta charset>`（先頭 2048 バイト）→ UTF-8 で復号 | 常に UTF-8 に正規化して返すので、最初の判定で決まる |
| `DOMParser` で inert な document を作り、`og:` → `twitter:` → `<title>` の順に拾う | 解析はしない。HTML をそのまま渡す |
| `title` 200 文字 / `description` 400 文字 / 画像 URL 2048 文字にクリップ | 切り詰めない（受け側の仕事） |
| `title` が無ければカードを出さない | — |
| 5 秒で abort | 対象ページの取得は 4 秒で打ち切る。相手の待ち時間の内側で決着させるため |

カードの `href` は投稿に書かれていた URL で、ページが名乗る `og:url` は見ない。つまり
**このプロキシはラベルを偽れても行き先は変えられない**——上流のその判断に乗っている。

## 安全側の作り

公開・無認証の API が任意の URL を fetch し、その HTML を返す以上、ここが唯一の歯止めになる。

- **公開 web だけ**。`http(s)` のみ、ポートは 80/443 のみ、`localhost` や `.local` /
  `.internal`、プライベート・リンクローカル・CGNAT・IPv6 のローカル各種は拒否
  （`169.254.169.254` のようなメタデータ endpoint 対策。`src/target-url.ts`）。
  URL に埋まった認証情報は落としてから投げる。リダイレクトは自前で追い、**ホップごとに**同じ判定を通す。
- **HTML だけ・先頭 256 KiB だけ・4 秒だけ**。超過分はストリームを cancel して読まない。
- **返す HTML は動かさない**。`content-security-policy: sandbox` と `nosniff` を付けているので、
  このエンドポイントを直接ブラウザで開いても対象ページのスクリプトは走らない。
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

アプリ側から使うときは、この URL を `VITE_OGP_PROXY` に入れてビルドする
（`VITE_OGP_PROXY=http://localhost:8787/ogp npm run dev`）。

テストはリポジトリのルートで走る（`npm run test`）。ランタイム依存を切ってあるので、
URL ガードも文字コード判定もハンドラ本体も Node の vitest でそのまま動く。
