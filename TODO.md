# TODO / 検討メモ

アプリ改善の議論で出た「実現性の相談」事項と、今後の改善候補をまとめたメモ。
※コード変更済みのものはここには含めない（このファイルは未着手の検討事項用）。

## eHagaki（投稿エディタ）連携

※ Web Component 版（`<ehagaki-composer>`）への移行は**対応済み**。経緯・実装・宿題は
`EHAGAKI_WEB_COMPONENT.md` を参照。以下はその上で残っているもの。

※ **eHagaki 側の初回ログイン 1 タップは解消済み**。要望に出していた NIP-07 の自動ログインが
上流に入り（[Lokuyow/ehagaki#188](https://github.com/Lokuyow/ehagaki/pull/188)）、combine は
`auto-login` 属性を付けて対応した。アカウント切替・ログアウト後の再ログインも無言になる。

- [ ] **実機で通す**
  - キーボードで投稿ボタンが隠れる件は**原因を確定させて修正し、Android Chrome の実機で確認済み**
    （eHagaki が `navigator.virtualKeyboard.overlaysContent` を立てるので `visualViewport` が
    縮まなくなっていた。経緯は `EHAGAKI_WEB_COMPONENT.md`）。
  - その後**「今度は縮みすぎる」報告**があり、キーボード矩形の `top` ではなく**高さ**から
    可視領域の下端を出すように直した。**こちらも実機で確認済み**（矩形は高さ 322・幅 411 は
    正しく、位置だけが 414px ずれていた。`EHAGAKI_WEB_COMPONENT.md` の
    「続報: 今度は縮みすぎる」に実測値を残した）。
  - **iOS Safari は未確認**（そちらは従来どおり `visualViewport` の経路で、退行していないかを見る）。
  - 動画圧縮も未確認。クロスオリジンの worker は上流が対応済み（blob URL 経由）だが、
    実機で通したことはまだ無い。

- [ ] **上流にマスコットの色を埋め込みでも変えられるようにしてもらう**
  - ヘッダのキャラの色は SVG の `fill` 属性に直書きで、変数を読む分岐が
    `layoutMode === "viewport"`（スタンドアロン版）でしかクラスの付かない `.custom-accent` に
    ゲートされている。Web Component では何を設定しても緑のまま。
  - combine 側はシャドウルートに規則を差し込んで金にした（**対応済み**。ヘッダボタンの赤枠と
    吹き出しも `app.css` で寄せた。詳細は `EHAGAKI_WEB_COMPONENT.md`）。`--ehagaki-accent-color`
    に追従してくれれば、この差し込みは要らなくなる。

- [ ] **上流に `F6()` のシャドウルート対応を出す**
  - eHagaki 自身のキーボード補正が Web Component 版で一度も効かない
    （`document.activeElement` が retarget されるため）。詳細は `EHAGAKI_WEB_COMPONENT.md`。

- [ ] **Dexie のバージョンを nostr-cache と eHagaki で揃える**
  - 両者が別バージョンを同梱していて（4.4.4 / 4.4.2）、同じ realm に載せると後から
    読み込んだ方が throw する。いまは combine 側で回避している（`shieldDexieRegistry`。
    経緯は `EHAGAKI_WEB_COMPONENT.md`）。
  - nostr-cache 側を 4.4.2 に寄せれば回避策を消せる。上流の実装依存が減る。

- [ ] **上流にフォーカス API（`composer.focus()`）を出す**
  - フッタの「投稿」を押すとエディタにカーソルが入るのは**対応済み**。open ShadowRoot 越しに
    `[data-post-editor-root]` の中の contenteditable を掴んで `.focus()` している
    （経緯と、タップと同じタスクで終わらせる必要がある理由は `EHAGAKI_WEB_COMPONENT.md`）。
  - 残っているのは**上流の DOM 構造に乗っている**こと。`focus()` が 1 本あれば消える依存。
  - **キーボードが実際に上がるかは実機で未確認**（本番は iOS Safari。上の「実機で通す」と同じ）。

- [ ] **本文・メンションのプリフィル UI を追加する**
  - `setContext({ content })` を呼ぶだけで実現できる（要素のメソッド直呼び。`reply` / `quotes` は
    UI 対応済み、`content` は **UI から未使用**）。
  - メンション専用フィールドは無い。`content` に `nostr:npub…` / `nostr:nprofile…` を
    含める形になる（eHagaki 側のパース実装に依存）。
  - → 「本文やメンションを差し込んで投稿画面を開く」入口（UI or URL クエリ等）を足せば実現可。

## Nostr Web Components（表示）のカスタマイズ

※ 投稿一覧（ホームタイムライン・通知・プロフィールの投稿・検索結果）はすべて
nostr-cache（`nostr-timeline` / `nostr-follow-timeline`）へ移行済みで、`nostr-list` は未使用。
個別投稿も `nostr-post` へ移行済みで、`nostr-list` / `nostr-note` は未使用。
この節の対象は残った `nostr-profile` のみ。

※ アクションボタンは**対応済み**。nostr-cache の `actions` 属性で各投稿の下にボタンを描画し、
`nostr-timeline:action` でクリックを受け取る形が全タイムラインと個別投稿画面に入っている
（`src/lib/postRef.ts` / `src/lib/postAction.ts`）。いま出ているのは 返信・リポスト・共有・詳細 の 4 つで、
publish 処理（下記「publish 経路」）もリポストで入った。下記「ハイブリッド案」は 1〜3 とも不要になった。
残っているのはリアクション（kind 7）と、ボタン定義が一覧で 1 つなので「リポスト済み」を出せない件。

※ **キャッシュの話は解決済み**（この節の対象外）。通知・プロフィール・検索も
nostr-cache のブラウザ内リレーを経由するようになった（`src/lib/cacheRelay.svelte.ts`）。
残っているのは下記の「表示のカスタマイズ」だけ。

- [ ] **投稿表示のカスタマイズ（中身の改変／各投稿下にアクションボタン追加）**
  - `@konemono/nostr-web-components@0.3.0` は **Shadow DOM** でレンダリングし、
    `slot` / `::part` / `::slotted` を公開していない。
    → 外から中身の DOM 注入・構造変更・CSS 上書きはほぼ不可。
    調整できるのは属性（`theme` / `display` / `href` / `noLink` / `height` / `relays` / `filters` / `limit`）のみ。
  - **表示専用**で、返信・リポスト・リアクション・Zap のボタンも publish 機能も無い
    （combine のアクションボタンは nostr-cache 側の要素にしか出せない。この節は `nostr-profile` の話）。
  - 実現の現実解（ハイブリッド案）:
    1. 自前でイベント一覧を取得（`NostrClient.fetchByFilters` 等。既存の relay/auth/follows 基盤を活用）
    2. 各イベントを `<nostr-note id=…>` で表示し、その **下に自前のアクションボタンを通常 DOM で配置**
    3. リアクション(kind7)/リポスト(kind6)/返信(kind1) を組み立て、署名（Nosskey）→ リレーへ publish
  - ~~不足しているのは「リレーへ publish する処理」~~ → **対応済み**。ライブラリは足さず、
    生 WebSocket で `["EVENT", ev]` を送って `["OK", …]` を待つ実装にした（`src/lib/publish.ts`）。

## OGP（リンクカード）

※ **API だけ先に作ってある**（`workers/ogp` の Cloudflare Worker。契約は
`workers/ogp/README.md`）。アプリ側は**まだ何も繋いでいない**——リンクは従来どおりリンクのまま。

- [ ] **埋め込みウィジェットにエンドポイントを渡す**
  - 上流の受け側は `ogp-endpoint` 属性で、3 要素とも同じ（nostr-cache の
    `claude/webcomponent-ogp-display-qd624l`。まだ本流には入っていない）。叩き方は
    `GET {endpoint}?url=<対象>` で、この Worker がそのまま受けられる形。
  - combine 側は各埋め込み（`HomeView` / `TimelineEmbed` / `PostView`）に 1 行足すのと、
    `src/custom-elements.d.ts` に属性を宣言するので済む。**上流が本流に入ってから**。
  - エンドポイントをコードに直書きするかビルド時の設定（`VITE_OGP_ENDPOINT` など）にするかも
    そのときに決める。未設定なら属性を付けない、が素直な倒し方。

- [ ] **上流の画像 URL 512 文字制限を相談する**
  - 上流は `image` を `safeText(value, 512)` に通すので、**512 文字を超える署名付きの
    CDN URL はカードから画像が消える**（`profile.ts` の `MAX_URL_LENGTH` はアバター向けの値）。
    Worker 側では短くしようがないので、上流で OGP 画像だけ枠を広げてもらうしかない。

- [ ] **Worker をデプロイする**
  - `cd workers/ogp && npm run deploy`（要 `wrangler login`）。
  - 自分のオリジンだけに絞るなら `wrangler.jsonc` の `vars` に `ALLOWED_ORIGINS` を足す。

## リレー設定

- [x] **ユーザーのリレー設定を nosskey.app から取得して使う**（対応済み）
  - ログイン時（および localStorage から復元したセッションの起動時）に
    `client.getRelays()` を呼び、ユーザーの read リレーを `auth.relays` に反映する。
    取得できない場合は `DEFAULT_RELAYS` にフォールバック（`readRelaysFrom()`）。
  - 全ビュー（Home / Profile / Search / Notifications / Header）と `fetchFollows` が
    ユーザーのリレーを参照するようになった。ただしビューが直接読むのは
    `auth.relays` ではなく `cacheRelay`（`upstreamRelays` / `viewRelays`）。
    `auth.relays` は起動直後に差し替わるため、そのままウィジェットに渡すと
    再購読で表示が消える（詳細は `CLAUDE.md`）。
  - 残課題（write リレー）: 投稿（publish）は combine 自身ではなく **埋め込みの eHagaki に委譲**
    しており（combine は `window.nostr` 経由で pubkey と `signEvent` を出すだけ、publish と
    publish 先リレーは eHagaki 側）、Web Component にもリレーを渡す口が無い（eHagaki は
    kind 10002 を自前で取りに行く。`getRelays` も呼ばない）。
    `getRelays()` の write リレーは**リポストの publish で使い始めた**（`src/lib/repost.ts`）が、
    eHagaki に委譲している通常の投稿には届かないまま。
    ユーザーの write リレーで publish させるには **上流への要望**か、`configureHostOwned`
    （`EHAGAKI_WEB_COMPONENT.md`。publish もアップロードも自前になるので採っていない）が要る。
  - 補足: NIP-65（kind 10002）の自分のリレーリストをリレーから取得する案も併用検討可。


## ユーザー詳細画面（`#/user/…`）の残り

導線そのものは対応済み（投稿カードのアイコン・表示名から開く。nostr-cache 側は
[ocknamo/nostr-cache#77](https://github.com/ocknamo/nostr-cache/issues/77) /
[#78](https://github.com/ocknamo/nostr-cache/pull/78) で `author-action` 属性が入った）。
画面の中身は `ProfileView.svelte` を `own=false` で使い回していて、いま出ているのは
**プロフィールカード（`nostr-profile display="card"`）・npub のコピー・kind 1 の投稿 30 件**だけ。
足りないものを洗い出した結果を、実現コストの低い順に並べる。

### すぐ入れられる（いまある仕組みだけで完結する）

- [ ] **他クライアントへ渡す導線**（共有そのものは対応済み）
  - ページ URL のコピー／`navigator.share` は入った（`ProfileView` の「共有」）。
    残っているのは `nostr:npub…` や njump で **他の Nostr クライアントに開かせる**入口。
  - 自分自身のページを開いたときの分岐も対応済み（`#/user/<自分>` は「あなた」表示になり、
    鍵の管理とログアウトが出る）。ただし scrollMemory のキーは `profile` と
    `user/<npub>` に割れたままで、これは同じ人のページが 2 つの経路を持つ以上そのまま。

- [ ] **「この人にメンションして投稿」**
  - `setContext({ content: 'nostr:npub…' })` を呼べば実現できる（要素のメソッド。UI から未使用）。
    ユーザー詳細画面はその入口として自然。
  - 足りないのは **compose へ文字列を持ち込む経路**。`parseRoute` は `compose` に param を
    取らないので、小さな共有ストア（例: `composeContext.svelte.ts`）を挟むのが素直。
    要素がまだ立っていないタイミングは `ComposeView` が面倒を見る（`pendingContext` に置いて
    ready 後に流す。compose に入るまで要素は作られない）。

- [ ] **投稿一覧が kind 1・30 件のまま**
  - リポスト（kind 6）も長文（kind 30023）も出ない。件数もホーム（50）と揃っていない。
  - 「投稿だけ／返信も含む」の切り替えは **NIP-01 のフィルタでは書けない**
    （「e タグが無いもの」を指定する手段が無い）。ウィジェット側の対応が要る。
  - 続きを読む手段も無い。配布中の `nostr-timeline.js` には load-more 相当の入口が無く、
    `max-events` は保持上限であってページングではない。これも上流待ち。
    当面できるのは `kinds` を `[1, 6]` にする・limit をホームと揃える程度。

### 土台が要る（イベントを自前で読む経路が無い）

- [ ] **kind 0 / kind 3 を自前で取得する薄いクライアント**
  - いま combine はイベントの取得をすべてウィジェットに任せていて、自前の取得経路が無い。
    `nostr-profile` は Shadow DOM なので描画結果も読めない。この一点が原因で下記が全部できない。
    - BackBar が「ユーザー」固定で相手の名前が出ない。`document.title` も変わらないので、
      共有リンクから開いたときに誰のページか分からない
    - フォロー数・フォロワー数、「フォロー中」バッジ（自分の kind 3 に相手が居るか）
    - lud16（Zap 用のライトニングアドレス）・website・NIP-05 の再利用
  - 実現は重くない。`cacheRelay.interceptUrl` へ生の WebSocket を張って REQ を投げるだけで、
    ブラウザ内リレーは `globalThis.WebSocket` の差し替えなので自前の接続もそのままキャッシュに載る。
    依存追加も不要（nostr-tools は未導入で、rx-nostr も直接の依存ではない）。

- [ ] **フォロー一覧 / フォロワー一覧**
  - フォローは相手の kind 3 の p タグを `nostr-profile` で並べるだけ。読むだけなので publish 不要。
  - フォロワーは `{ kinds: [3], '#p': [hex] }` の逆引きになり、リレーの対応と件数次第。
    まずフォロー側だけでも価値がある。

- [ ] **NIP-05 を `#/user/…` で解決する（検索結果との重複解消）**
  - `SearchView` は npub / nprofile / NIP-05 の結果をその場でプロフィールカード＋投稿一覧として
    描いていて、ユーザー詳細画面と中身が同じ。カードを `#/user/…` への入口にして一覧はそちらに
    任せたいが、**NIP-05 は `toHexPubkey` が解決できず**「ユーザーが見つかりませんでした」になる。
  - ユーザー詳細画面側が `/.well-known/nostr.json` を引いて hex に解決できれば、
    「hex に解決できたときだけリンクにする」ような分岐を足さずに一本化できる。
  - `nostr-profile` は `href="#/user/{id}" target="_self"` でカード自体をリンクにできる
    （`{id}` は `user` 属性の値がそのまま入る。`target` の既定が `_blank` なので明示が要る）。

### publish 経路が要る（ここが本丸）

- [x] **署名済みイベントをリレーへ publish する処理**（対応済み）
  - `auth.signEvent` で署名し、`publishEvent`（`src/lib/publish.ts`）が write リレーへ
    `["EVENT", ev]` を送って `["OK", id, true]` を待つ。1 本でも受理されれば成功として扱う。
    ライブラリは足していない。
  - 送り先は `auth.getWriteRelays()`（`getRelays()` の write リレー、取れなければ既定）。
  - いまの利用者はリポスト（kind 6 / 16）だけ。**リアクション（kind 7）は未実装**で、
    足すならこの経路にイベントを 1 つ組み立てて渡すだけで済む。

- [ ] **フォロー / フォロー解除**
  - 上記の publish ＋ kind 3。難所は UI ではなく **kind 3 が全置換**であること。
    取りこぼした状態で publish すると相手のフォローを消す事故になるので、複数リレーから集めて
    `created_at` が最大のものをベースにする・1 件も取れなければ publish しない、という
    ガードが要る。

- [ ] **相手の投稿へのリアクション（kind 7）**
  - 返信・リポスト・共有は**対応済み**（`src/lib/postAction.ts`。全一覧と個別投稿画面のボタン行）。
    残っているのはリアクションだけで、上の publish 経路に kind 7 を 1 つ組み立てて渡せば済む。
  - ただし**押した結果は自分の画面に返ってこない**。カードを描くのはウィジェットで、
    ボタン定義は一覧で 1 つなので、「リアクション済み」「リポスト済み」を投稿ごとに出す手段が無い
    （個別投稿画面のリアクション集計には、リレーから返ってくれば載る）。

- [ ] **ミュート / ブロック（kind 10000）**
  - publish は同じでも **表示側に効かない**。一覧を描くのはウィジェットで、NIP-01 のフィルタに
    「この author を除く」は書けない。リストには入れられるが画面には反映されない、という
    中途半端な状態にしかならないので、上流対応が入るまでは優先度が低い。

- [ ] **Zap**
  - kind 0 の lud16 → LNURL-pay → invoice → ウォレット（WebLN / QR）と道のりが長い。
    zap request（kind 9734）の署名自体は `signEvent` で足りる。まずは
    「ライトニングアドレスを表示してコピー」までで十分かもしれない。

### 上流（nostr-cache）待ち

- [ ] **導線を残りの箇所へ広げる**
  - 押せるのは投稿カードの著者（`author-action`）と引用カード本体（`note-action`）まで。
    **引用カードのヘッダにいる著者・リアクター一覧の各行・本文中の `nostr:` メンション**は
    据え置きで、上流が別 issue に切り出す想定。特にメンションは現在
    「行き先が無いので意図的にリンクにしていない」ものなので効果が大きい。
  - combine 側は detail の `pubkey` / `event` を読んで飛ぶだけなので、上流が同じ
    `nostr-timeline:action` に載せてくれれば**追加の実装は要らない**
    （`actionPath` がそのまま裁く）。
