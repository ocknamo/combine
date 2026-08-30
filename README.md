# combine

シンプルな Nostr クライアント。複数の Nostr サービスを「組み合わせて」作られています。

![combine](public/logo.png)

## 構成サービス

| 機能 | サービス | 連携方法 |
| --- | --- | --- |
| 署名（パスキー） | [Nosskey](https://nosskey.app) | [nosskey-iframe](https://github.com/ocknamo/nosskey-sdk) による iframe 埋め込み |
| 投稿エディタ | [eHagaki](https://lokuyow.github.io/ehagaki/) | ホスト済み Web Component (`ehagaki-composer`) |
| 投稿一覧（タイムライン・通知・プロフィール・検索） | [nostr-cache](https://github.com/ocknamo/nostr-cache) | ホスト済み Web Components (`nostr-timeline` / `nostr-follow-timeline`) |
| 個別投稿表示 | [nostr-cache](https://github.com/ocknamo/nostr-cache) | ホスト済み Web Component (`nostr-post`) |
| イベント取得のキャッシュ | [nostr-cache](https://github.com/ocknamo/nostr-cache) | ブラウザ内リレーを全ビューの手前に透過キャッシュとして挟む |
| プロフィール表示 | [Nostr Web Components](https://github.com/TsukemonoGit/nostr-web-components) | Web Components (`nostr-profile`) |

秘密鍵はこのアプリに渡りません。署名は nosskey.app の iframe の中だけで起き、そこが独自の同意ダイアログでゲートします。
eHagaki は combine が `window.nostr` に生やす NIP-07 シム（`src/lib/nip07.ts`）越しに署名を頼みます。
ただし Web Component なので eHagaki のコードは combine と同じページで動きます（DOM・storage には届きます）。

## 機能

- パスキーログイン（Nosskey iframe / NIP-07 互換）
- ホームタイムライン（フォロー中 / グローバル切り替え）
  - 「フォロー中」は `nostr-follow-timeline` が kind 3 の取得とキャッシュまで担当する
  - タブのタップだけでなく、横スワイプでも切り替わる（`src/lib/swipe.ts`）。
    縦スクロールの誤検知を避けるため、しきい値は広めに取ってある
- 投稿一覧はすべて同じ nostr-cache の埋め込み
  - ホームも通知もプロフィールの投稿も検索結果も `src/lib/components/TimelineEmbed.svelte`
    1 つで描く。ホームの「フォロー中」だけ `nostr-follow-timeline` に pubkey を渡し、
    ほかは `nostr-timeline` に NIP-01 フィルタ（グローバルは kinds / limit）を渡す形。
    メディア・引用・メンションの扱い、テーマ変数、投稿下のアクションボタンが全ビューで揃う
  - キャッシュはこれとは別の話。下記の透過キャッシュはウィジェットに寄せる前から
    全ビューに効いている
- 全ビューの透過キャッシュ
  - nostr-cache がブラウザ内リレーを上流リレーの手前に挟むため、2 回目以降の表示は
    IndexedDB のキャッシュから即座に描画される
  - タイムラインだけでなく、通知・プロフィール・検索も同じキャッシュを通る。
    ブラウザ内リレーは `globalThis.WebSocket` を差し替えて 1 つの URL への接続だけを
    横取りする仕組みなので、`nostr-timeline` / `nostr-post` は自分でリレーを掴んで、
    Nostr Web Components（`nostr-profile`）は接続先をその URL に向けることで載る
    （どちらも内部は rx-nostr）
  - プロフィール（kind 0）は 1 時間の鮮度ウィンドウが効き、Header とプロフィール画面が
    同じ pubkey を取り直さなくなる
  - nostr-cache に到達できない環境では自動的に上流リレー直結へフォールバックする
- 投稿へのアクション（返信・リポスト・リアクション・共有・詳細）
  - 埋め込みウィジェットの各投稿の下にアイコンボタンが並ぶ。nostr-cache の `actions` 属性で
    描画され、タップは `nostr-timeline:action` として届く（`src/lib/postRef.ts` /
    `src/lib/postAction.ts`）。一覧（ホーム・通知・プロフィール・検索結果）と個別投稿画面の
    本体に出る（個別投稿画面では「詳細」を除いた 4 つ。返信ツリーの各返信には出ない）
  - **返信**は eHagaki の投稿画面を返信先つきで開く。押した投稿を `nevent1…`（著者つき）に
    して `composeContext` に置き、compose タブへ移ると `ComposeView` が `setContext({ reply })`
    に流す（`src/lib/composeContext.svelte.ts`）
  - **リポスト**は combine 自身が kind 6（kind 1 以外は kind 16 ＋ `k` タグ。NIP-18）を組み立て、
    Nosskey で署名して**ブラウザ内リレー 1 本**へ publish する（`src/lib/repost.ts` /
    `src/lib/publish.ts`）。nostr-cache は write-through なので、受けたイベントを
    IndexedDB に入れて `OK` を返し、上流リレーへはリレー自身が流す。キャッシュに載る分、
    自分の画面にはリレーから返ってくるのを待たずに出る。ブラウザ内リレーが無い環境では
    読み込みと同じくフォールバックし、ユーザーの write リレーへ直接送る
    （`getRelays()` の write リレーはここで初めて使われる）。
    確認は nosskey.app の同意ダイアログが兼ねる
  - **リアクション**は combine 自身が kind 7（content は `+`。`e` / `p` に加えて反応先の kind を
    `k` タグで持つ。NIP-25）を組み立て、リポストと同じ経路で署名・publish する
    （`src/lib/reaction.ts`。署名と送信は両者で共通の `src/lib/publishOwn.ts`）。
    絵文字は選べず、押せば `+` が飛ぶ（nostr-cache が ⭐ として集計するので、ボタンも `star`）
  - **共有**は個別投稿画面の URL（`…#/post/note1…`）を `navigator.share` へ。無い環境では
    クリップボードへ（プロフィールの共有と同じ `src/lib/share.ts`）
  - 通知タブのリポスト・リアクション・Zap では、そのイベント自体ではなく `e` タグの指す
    元の投稿が対象になる（返信・リポスト・リアクション・共有・詳細のいずれも）
  - ボタンの定義は一覧全体で 1 つなので、「リポスト済み」「リアクション済み」の表示や
    投稿ごとの無効化はできない（個別投稿画面のリアクション集計には、押した分も載る）
- 個別投稿画面（`#/post/<note1 / nevent1 / naddr1 / hex>`）
  - `nostr-post` が本文を省略なしで描画し、リアクション（kind 7）を絵文字ごとに集計して並べる
  - 一覧の各投稿に出る「詳細」ボタンから開く（上記のアクション行）
  - アイコンは Material Symbols（`material-icons="outlined"`）。nostr-cache が
    Google Fonts から該当スタイルシートを読み込む
  - **本文中に埋め込まれた引用投稿のカードをタップしても、その投稿の画面が開く**。
    nostr-cache の `note-action` 属性で押せるようになり、タップは「詳細」ボタンと同じ
    `nostr-timeline:action` として、引用された側のイベントを載せて届く（`src/lib/postRef.ts`）
  - 一覧（ホーム・通知・プロフィール・検索結果）だけでなく、個別投稿画面の本体と返信ツリーの
    中にある引用カードでも効くので、引用をたどって次々に開いていける
- ユーザー詳細画面（`#/user/<npub / nprofile / hex>`）
  - **投稿カードのアイコン・表示名をタップすると、その人の画面が開く**。nostr-cache の
    `author-action` 属性で押せるようになり、タップは投稿の「詳細」ボタンと同じ
    `nostr-timeline:action` として、押された人の pubkey 付きで届く（`src/lib/postRef.ts`）
  - ホーム・通知・検索結果・プロフィールの投稿一覧に加えて、個別投稿画面の本体と
    返信ツリーの各返信でも効く
  - 中身はプロフィール画面と同じ（プロフィールカード・その人の投稿一覧・npub コピー・共有）。
    鍵の管理とログアウトが出るかは、どの経路で開いたかではなく**誰のページか**で決まる
    （自分のアイコンをタップして開いた `#/user/<自分>` は自分のページなので出る。
    そのときは戻るバーの見出しも「あなた」になる）
- 投稿・返信・引用（eHagaki の Web Component 埋め込み）
  - 返信先・引用先は投稿カードの「返信」ボタンから入るほか、パネルに note1 / nevent1 を
    直接入れても設定できる
  - 要素は compose タブに初めて入ったときに組み立て、以後は保持する。数 MB のエディタなので
    アプリ起動時には読み込まない（`src/lib/components/ComposeView.svelte`）
  - 下書き・設定は combine のオリジンに保存される。ログアウトすると消す
  - エディタの見た目は combine のパレットに揃う（`--ehagaki-*`）
  - eHagaki 側のログインは自動（`auto-login`）。combine でログインしていれば追加のタップは要らない
  - エディタの接続先も**ブラウザ内リレー 1 本**（`relays`）。プロフィールや返信・引用先の
    プレビューは combine と同じキャッシュから出て、投稿はそのリレーが保存して上流へ流す。
    タイムラインの表示・リポスト・リアクションと同じ経路（`src/lib/ehagakiComposer.ts`）
- 通知（メンション・リポスト・リアクション・Zap）
- プロフィール表示・自分の投稿一覧・npub コピー
- プロフィールの共有（`navigator.share`、無い環境ではリンクをクリップボードへ）
- 検索（ハッシュタグ / npub / nprofile / NIP-05。note1 / nevent1 / naddr1 は個別投稿画面へ遷移）
- シングルカラム・モバイルファーストのレスポンシブデザイン
  - 表示中のホームタブをもう一度タップすると、タイムラインの先頭までスクロールで戻る

## 開発

```bash
npm install
npm run dev          # 開発サーバー
npm run build        # 本番ビルド
npm run check        # svelte-check + tsc
npm run lint         # biome
npm run format       # biome フォーマット
npm run test         # vitest（workers/ogp のテストもここで走る）
```

`workers/ogp` はリンクカード用の CORS プロキシ（Cloudflare Workers。`GET /ogp?url=…` に
対象ページの HTML を返す）。OGP タグを読むのは埋め込みウィジェット側で、combine はこの URL を
`ogp-proxy` 属性として渡すだけ。契約と設計は `workers/ogp/README.md`。
デプロイ単位が別なので依存も別にしてある。

渡す URL はビルド時の `VITE_OGP_PROXY` から取る。**未設定ならリンクカードは出ない**
（属性ごと付けない）——既定のプロキシは無く、各デプロイが自分の Worker を使う前提。

```bash
VITE_OGP_PROXY=http://localhost:8787/ogp npm run dev   # 手元の Worker に向ける
```

GitHub Pages 向けには、リポジトリ変数 `VITE_OGP_PROXY` を設定するとデプロイに乗る
（`.github/workflows/deploy.yml`）。

```bash
cd workers/ogp
npm install
npm run dev          # http://localhost:8787/ogp?url=…
npm run typecheck
npm run deploy       # 要 wrangler login
```

## ライセンス

MIT
