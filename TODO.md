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
（`src/lib/postRef.ts` / `src/lib/postAction.ts`）。いま出ているのは
返信・リポスト・リアクション・共有・詳細 の 5 つで、publish 処理（下記「publish 経路」）も
リポストとリアクションで入った。下記「ハイブリッド案」は 1〜3 とも不要になった。
残っているのは、ボタン定義が一覧で 1 つなので「リポスト済み」「リアクション済み」を出せない件。

※ **キャッシュの話は解決済み**（この節の対象外）。通知・プロフィール・検索も
nostr-cache のブラウザ内リレーを経由するようになった（`src/lib/cacheRelay.svelte.ts`）。
残っているのは下記の「表示のカスタマイズ」だけ。

- [ ] **プロフィールカードの画像が画像プロキシを通らない**
  - nostr-cache の 3 要素（タイムライン 2 つ・個別投稿）は `image-proxy` で最適化プロキシ経由に
    なった（**対応済み**。添付・アバター・OGP サムネイル）。残るのは `nostr-profile` で、
    ヘッダのアバターとプロフィール画面のカードだけ原寸のまま落ちてくる。
  - `@konemono/nostr-web-components` に相当する属性は無く、Shadow DOM なので外から
    `<img src>` を書き換える手段も無い。上流対応か、カードを自前で描くか（下記の
    「kind 0 / kind 3 を自前で取得する薄いクライアント」があれば `<img>` は自分で出せる）。

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

`workers/ogp` の CORS プロキシ（契約は `workers/ogp/README.md`）と、埋め込みへの受け渡しは
入れてある。残りは**デプロイして URL を設定するだけ**。

- [x] **埋め込みウィジェットにプロキシを渡す**（対応済み）
  - 上流の受け口は `ogp-proxy` 属性で、3 要素とも同じ（nostr-cache#89 でマージ済み。
    それ以前の `ogp-endpoint`＋JSON API は廃止）。叩き方は `GET {proxy}?url=<対象>` で、
    返すのは対象ページの HTML。解析はウィジェット側。
  - combine 側は `TimelineEmbed` / `PostView` の 3 か所に `ogp-proxy` を足し、
    値はビルド時の `VITE_OGP_PROXY`（`src/lib/nostrCache.ts` の `OGP_PROXY`）から取る。
    未設定なら属性ごと付けない＝カード無し。

- [ ] **Worker をデプロイして `VITE_OGP_PROXY` を設定する**
  - `cd workers/ogp && npm run deploy`（要 `wrangler login`）。
  - デプロイ後、GitHub のリポジトリ変数 `VITE_OGP_PROXY` に `https://…/ogp` を設定すると
    Pages のビルドに乗る（`.github/workflows/deploy.yml`）。**ここまでやって初めてカードが出る**。
  - 自分のオリジンだけに絞るなら `wrangler.jsonc` の `vars` に `ALLOWED_ORIGINS` を足す。

## 画像プロキシ

`image-proxy` の受け渡しは入れてある（[nostr-cache#101](https://github.com/ocknamo/nostr-cache/pull/101)）。
残りは**リポジトリ変数を設定するだけ**。

- [ ] **`VITE_IMAGE_PROXY` を設定する**
  - GitHub のリポジトリ変数に画像最適化プロキシの URL（`https://…/image`）を入れると
    Pages のビルドに乗る（`.github/workflows/deploy.yml`）。**設定して初めて画像が
    プロキシ経由になる**。未設定のあいだは書かれた URL から直接読み込む＝これまでどおり。
  - `VITE_OGP_PROXY` と同じく、URL はソースに置かない（全閲覧者の画像通信がどのホストを
    通るかはデプロイの判断なので、CD から渡す）。
  - 形式は [nostr-image-optimizer](https://github.com/ocknamo/nostr-image-optimizer) の
    `{proxy}/width=…,quality=…,format=webp/{元の画像 URL}`。同じ形式を解釈するプロキシなら
    差し替えられる。クエリやフラグメントを持つ URL は受け付けない（後ろに続くパスを飲み込むため）。

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
- [x] **eHagaki にもリレーを指定する**（対応済み）
  - 上流に `relays` プロパティが入ったので、接続前に nostr-cache のブラウザ内リレー 1 本を
    `{ url, read: true, write: true }` で渡している（`composerRelays` / `createComposer`。
    経緯と代償は `EHAGAKI_WEB_COMPONENT.md` の「リレーを指定する」）。
  - これでエディタの読み（プロフィール・返信/引用のプレビュー）も combine と同じキャッシュから
    出て、投稿もキャッシュに載ってから上流へ流れる。以前は eHagaki が自分で kind 10002 を
    取りに行っていて、combine 側からは何も指定できなかった。
  - 要素の一生ぶんの設定なので、`cacheRelay.resolved` を待ってから組み立て、intercept URL が
    動いたら作り直す（`ComposeView`）。ブラウザ内リレーが無い環境では渡さない＝従来どおり
    eHagaki の kind 10002 解決に任せる。

- [ ] **ブラウザ内リレーの上流に write リレーを含める**
  - 投稿・リポスト・リアクションはすべてブラウザ内リレー 1 本へ送り、上流へはリレー自身が流す。
    その上流は起動時に渡した `readRelaysFrom()` の **read リレー**なので、read と write が
    違う人の場合、投稿が本人の write リレーに載らない。
  - 直すなら `App.svelte` が `cacheRelay.start()` に渡す集合を read ∪ write にする。
    読み込みの宛先も増えるので、その影響（購読数・重複）とセットで考える。
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
  - `auth.signEvent` で署名し、`publishEvent`（`src/lib/publish.ts`）が `["EVENT", ev]` を
    送って `["OK", id, true]` を待つ。1 本でも受理されれば成功として扱う。ライブラリは足していない。
  - 送り先は**ブラウザ内リレー 1 本**（`cacheRelay.interceptUrl`）。nostr-cache は
    write-through で、受けたイベントを検証・保存して `OK` を返してから上流へ流すので、
    上流リレーを列挙して送る必要が無い。キャッシュに載るぶん自分の画面にも即座に出る。
  - ブラウザ内リレーが無いときだけ `auth.getWriteRelays()`（`getRelays()` の write リレー、
    取れなければ既定）へ直接送る。読み込み側の `pickViewRelays` と同じフォールバック。
  - 注意: write-through 経路の `OK` は「保存して上流へ渡した」までで、上流が受理したかは
    言っていない（リレー側の転送は fire-and-forget）。
  - 利用者はリポスト（kind 6 / 16）とリアクション（kind 7）。イベントを組み立てるのは
    `src/lib/repost.ts` / `src/lib/reaction.ts` で、署名と送信は共通の `src/lib/publishOwn.ts`。
    別の kind を足すときも、この経路にイベントを 1 つ組み立てて渡すだけで済む。

- [ ] **フォロー / フォロー解除**
  - 上記の publish ＋ kind 3。難所は UI ではなく **kind 3 が全置換**であること。
    取りこぼした状態で publish すると相手のフォローを消す事故になるので、複数リレーから集めて
    `created_at` が最大のものをベースにする・1 件も取れなければ publish しない、という
    ガードが要る。

- [x] **相手の投稿へのリアクション（kind 7）**（対応済み）
  - 返信・リポスト・共有と同じボタン行に入った（`src/lib/reaction.ts` / `src/lib/postAction.ts`。
    全一覧と個別投稿画面）。content は `+` 固定で、絵文字は選べない。
  - ただし**押した結果は一覧の自分の画面に返ってこない**。カードを描くのはウィジェットで、
    ボタン定義は一覧で 1 つなので、「リアクション済み」「リポスト済み」を投稿ごとに出す手段が無い
    （個別投稿画面のリアクション集計には、キャッシュ経由で載る）。

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
