# TODO / 検討メモ

アプリ改善の議論で出た「実現性の相談」事項と、今後の改善候補をまとめたメモ。
※コード変更済みのものはここには含めない（このファイルは未着手の検討事項用）。

## eHagaki（投稿エディタ）連携

- [ ] **投稿画面を開いたときにエディタへ自動フォーカスする**
  - 現状不可。eHagaki はクロスオリジン iframe（`https://lokuyow.github.io`）のため、
    親（combine）から中の入力欄を `.focus()` できない。
  - `ehagaki.embed` プロトコルにフォーカス用メッセージ（例: `composer.focus`）が無く、
    送る手段も無い。
  - モバイルはユーザー操作と非同期なフォーカスではソフトキーボードが開かない制約もある。
  - → 実現には **eHagaki 側プロトコルの拡張提案** が必要。

- [ ] **本文・メンションのプリフィル UI を追加する**
  - ブリッジ実装（`composer.setContext`）は `reply` / `quotes` / `content` に対応済み。
    - `reply`（返信先）・`quotes`（引用先）は UI 対応済み（`ComposeView.svelte`）。
    - `content`（本文プリフィル）は型・ブリッジはあるが **UI から未使用**。
  - メンション専用フィールドは無い。`content` に `nostr:npub…` / `nostr:nprofile…` を
    含める形になる（eHagaki 側のパース実装に依存）。
  - → 「本文やメンションを差し込んで投稿画面を開く」入口（UI or URL クエリ等）を足せば実現可。

- [ ] **Web Component 版（`<ehagaki-composer>`）への移行を検討する**
  （2026-08-22 に上流ドキュメントと実装を読んだ結果。`docs/WEB_COMPONENT.md` /
  `src/lib/nip07AuthService.ts` / `src/web-component/` を確認）

  eHagaki が iframe 版とは別に Web Component 版を出した。同じ Window realm で動く
  カスタム要素で、`postMessage` も parent-client の `auth.*` / `rpc.*` も**使わない**。
  つまり `src/lib/ehagaki.ts` のブリッジは丸ごと不要になる代わりに、**認証の受け渡し方を
  作り直す必要がある**。ここが移行するかどうかの分かれ目。

  ### 上流が提供しているもの

  - 配布: `https://lokuyow.github.io/ehagaki/web-component/ehagaki-composer.js` を
    `type="module"` で読み、要素に `asset-base` を同じディレクトリで渡す。
    GitHub Pages が `access-control-allow-origin: *` を返すのでクロスオリジン埋め込みは可能
    （2026-08-22 時点で確認）。エントリ自体は 97KB（gzip 29KB）で、本体は動的 import。
  - メソッド: `whenReady()` / `setSettings()` / `setContext()` / `setCustomEmojis()` /
    `configureHostOwned()`。`setContext` は `content` / `reply` / `quotes` / `channel` に加えて
    `preloadedEvents`（親が持っている署名済みイベントを渡して reply・quote のプレビューを即出す）。
  - イベント: `ehagaki-ready` / `ehagaki-post-success` / `ehagaki-post-error` /
    `ehagaki-composer-context-updated` / `ehagaki-initialization-error`（すべて
    `bubbles: true, composed: true`）。
  - スタイル: `--ehagaki-accent-color` / `--ehagaki-base-color` の 2 色指定と、
    `--ehagaki-background` などの個別 token override。
  - 制約: 1 document につき 1 インスタンス。open ShadowRoot。高さは host が definite な
    CSS height を持つ必要がある（`auto` は非対応）。

  ### combine にとっての利点

  - **テーマが揃う**。iframe には combine の CSS 変数が届かないので、いまエディタだけ
    見た目が浮いている。Web Component なら金・オリーブのパレットに寄せられる。
  - **storage がホスト側に乗る**。ブリッジは `storage.*` / `idb.*` の委譲を実装していないため、
    現状の下書き・設定は eHagaki 側の partitioned storage 頼み（第三者 storage の分離が効く
    ブラウザでは残りにくい）。Web Component は combine のオリジンに
    `ehagaki.web-component.v1:` namespace と IndexedDB `eHagakiDB` で保存する
    （combine のキャッシュ DB は `combine-timeline` なので衝突しない）。
  - **ブリッジ（211 行）とそのテストが消える**。`composer.setContext` は要素のメソッド直呼びになり、
    上の「本文・メンションのプリフィル」も `setContext({ content })` をそのまま呼ぶだけになる。
  - `preloadedEvents` があるので、combine が既に持っているイベントを渡して返信・引用の
    プレビューをリレー往復なしで出せる。

  ### コストとリスク

  - **自動ログインが消える**（いちばん大きい）。Web Component は NIP-07 として
    **ホストの `window.nostr` を直接使う**。combine は Nosskey の iframe を直接叩いていて
    `window.nostr` を生やしていないので、まずシムを足す必要がある。eHagaki が実際に呼ぶのは
    `getPublicKey` と `signEvent` の 2 つだけ（`getRelays` は使わず、write リレーは kind 10002 を
    自前で取りに行く）。ただしシムを足しても、**初回は composer 内の UI でログインを 1 タップ**
    しないと繋がらない。いまの `auth.login` を投げるだけで勝手に繋がる parent-client 連携に
    比べると UX は明確に後退する。
    - `getPublicKey` はキャッシュ済みの `auth.pubkey` を返す実装にすること。eHagaki は
      セッション復元時に `authenticate()` を呼ぶので、Nosskey の iframe へ往復させると
      起動のたびにパスキー確認が出かねない。
    - アカウント切替・ログアウトの同期も自前。`reconcileSession` が拾った切替を eHagaki 側へ
      伝える公開 API は無く、要素の作り直しと namespace の掃除しか手が無い。
    - `window.nostr` を生やすと、同じページに載っている外部ウィジェット（nostr-cache /
      Nostr Web Components）からも署名を要求できるようになる。鍵は Nosskey の iframe の中で、
      署名のたびに同意ダイアログが出るので鍵漏洩ではないが、信頼境界は確実に緩む。
  - **信頼境界**。lokuyow.github.io の JS が combine の realm で動く（DOM・storage・シムに
    フルアクセス）。上流ドキュメントも「ホスト JS から秘密情報を隔離したいなら iframe を使え」と
    明記している。combine は鍵を持たない（Nosskey iframe のまま）ので README の
    「秘密鍵はこのアプリに渡りません」は維持できるが、説明の書き足しは要る。
  - **重さ**。いまは Tiptap や mediabunny のコストが別ドキュメント側にある。Web Component では
    combine の document とメインスレッドに乗る。`ComposeView` は常時マウントなので、
    移行するなら compose ルートに入ってから `createElement` する遅延生成に変えること。
  - **データは移行されない**。iframe 時代の下書き・設定は引き継がれない。
  - **クロスオリジンの実機確認が要る**。モジュールとチャンクは CORS 済みだが、動画圧縮が
    遅延ロードする worker / WASM がクロスオリジンで動くかは実機（特に iOS Safari）で見るしかない。
    combine は CSP を設定していないので `worker-src` 側の問題は無い。
  - 影響しない制約: ローカル nsec 非対応（combine は Nosskey なので無関係）、
    browser-history と share-target の入力処理が無効（未使用）。

  ### host-owned mode（中期の本命）

  `configureHostOwned({ submit, uploadMedia })` を接続前に一度呼ぶと、eHagaki は認証も
  リレーも target 取得も一切始めない。**ログイン UI 自体が出なくなる**ので、上に書いた
  自動ログインの後退がそのまま解消する。しかも publish 先を combine が決められるので、
  「リレー設定」節の write リレー問題と、下の「publish 経路が要る（本丸）」が同じ実装に集約される。

  代わりに combine が持つことになるもの:

  1. イベント組み立て。`submit` に来るのは `{ content, tags, context }` で、`tags` は
     hashtag / CW / カスタム絵文字 / imeta だけ。`kind` / `pubkey` / `created_at` と
     `e` / `p` / `q` / `a` / `k`（NIP-10・NIP-18）は combine が作る。
  2. 署名 → `auth.signEvent` で既にできる。
  3. write リレーへの publish → 生 WebSocket で `["EVENT", ev]` を投げて `["OK", id, true]` を待つ。
  4. `uploadMedia` → 省略すると **text-only composer** になり、画像・動画圧縮という eHagaki の
     看板機能を失う。実装するなら NIP-96 + NIP-98（署名は `auth.signEvent` で足りる）。

  3 と 4 は下の「publish 経路が要る（本丸）」で挙げているものと同じ土台なので、先にそちらを
  作れば host-owned への移行にそのまま乗る。

  ### 判断

  - **いますぐ全面移行はしない**。自動ログインの喪失が combine の売り（パスキーで入ったら
    そのまま投稿できる）を直接削るため、テーマ統合と storage の利得だけでは釣り合わない。
  - 順序としては、(1) 実験ブランチで `window.nostr` シム＋self-publish の Web Component を
    動かし、モバイルのキーボード挙動・動画圧縮 worker・初回ログイン導線を実機で確認する →
    (2) 問題なければテーマ統合と storage 目当てで乗り換える価値はある →
    (3) 本命は host-owned。publish と NIP-96 アップロードを先に作る。
  - 並行して、上流へ **Web Component 版の signer 提供 API**（例: `configureSigner({ getPublicKey,
    signEvent })` と自動ログイン）を提案する手もある。ドキュメントに「Web Component 専用の
    signer callback/provider API はありません」と明記されているので、これは機能要望の話。
  - なお `composer.focus` 相当は Web Component 版にも無い（上の自動フォーカスの項目は解決しない）。

## Nostr Web Components（表示）のカスタマイズ

※ 投稿一覧（ホームタイムライン・通知・プロフィールの投稿・検索結果）はすべて
nostr-cache（`nostr-timeline` / `nostr-follow-timeline`）へ移行済みで、`nostr-list` は未使用。
個別投稿も `nostr-post` へ移行済みで、`nostr-list` / `nostr-note` は未使用。
この節の対象は残った `nostr-profile` のみ。

※ アクションボタンの土台は解決済み。nostr-cache の `actions` 属性で各投稿の下にボタンを描画し、
`nostr-timeline:action` でクリックを受け取る形が全タイムラインに入った（`src/lib/postRef.ts` /
`src/lib/postAction.ts`）。いま置いてあるのは詳細画面へ飛ぶ「詳細」ボタンだけだが、
下記「ハイブリッド案」の 1〜2 を自前で組む必要はもう無い。残るのは 3 の publish 処理だけ。

※ **キャッシュの話は解決済み**（この節の対象外）。通知・プロフィール・検索も
nostr-cache のブラウザ内リレーを経由するようになった（`src/lib/cacheRelay.svelte.ts`）。
残っているのは下記の「表示のカスタマイズ」だけ。

- [ ] **投稿表示のカスタマイズ（中身の改変／各投稿下にアクションボタン追加）**
  - `@konemono/nostr-web-components@0.3.0` は **Shadow DOM** でレンダリングし、
    `slot` / `::part` / `::slotted` を公開していない。
    → 外から中身の DOM 注入・構造変更・CSS 上書きはほぼ不可。
    調整できるのは属性（`theme` / `display` / `href` / `noLink` / `height` / `relays` / `filters` / `limit`）のみ。
  - **表示専用**で、返信・リポスト・リアクション・Zap のボタンも publish 機能も無い。
  - 実現の現実解（ハイブリッド案）:
    1. 自前でイベント一覧を取得（`NostrClient.fetchByFilters` 等。既存の relay/auth/follows 基盤を活用）
    2. 各イベントを `<nostr-note id=…>` で表示し、その **下に自前のアクションボタンを通常 DOM で配置**
    3. リアクション(kind7)/リポスト(kind6)/返信(kind1) を組み立て、署名（Nosskey）→ リレーへ publish
  - 不足しているのは「リレーへ publish する処理」。`rx-nostr`（同梱）か `nostr-tools` のどちらで行うか要決定。

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
    しており（combine は pubkey 提供と `signEvent` のみ、publish と publish 先リレーは eHagaki 側）、
    `ehagaki.embed` プロトコルに combine → eHagaki へリレーを渡す手段が無い。
    そのため `getRelays()` の write リレーは現状どこにも使われていない。
    ユーザーの write リレーで publish させるには **eHagaki 側プロトコルの拡張提案**（例: `composer.setContext`
    で `relays` を渡す）が必要。
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
  - `composer.setContext` の `content` に `nostr:npub…` を渡せば実現できる
    （ブリッジは対応済み・UI から未使用）。ユーザー詳細画面はその入口として自然。
  - 足りないのは **compose へ文字列を持ち込む経路**。`parseRoute` は `compose` に param を
    取らないので、小さな共有ストア（例: `composeContext.svelte.ts`）を挟み、`ComposeView` が
    bridge の ready 後に流す形が素直（`ComposeView` は常時マウントで、bridge が立つ前に
    `setContext` を呼んでも届かない）。

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

- [ ] **署名済みイベントをリレーへ publish する処理**
  - **署名は `auth.signEvent` で既にできる**。足りないのはリレーへ送る部分だけで、
    `["EVENT", ev]` を投げて `["OK", id, true]` を待つ生 WebSocket でも書ける。
    ライブラリ選定（rx-nostr / nostr-tools）を待つ必要は無い。
  - 送り先は `getRelays()` の **write リレー**。publish を eHagaki に委譲している限り使い道が
    無かったが、自前 publish ならここで初めて使える（eHagaki 側の拡張提案を待たずに済む）。

- [ ] **フォロー / フォロー解除**
  - 上記の publish ＋ kind 3。難所は UI ではなく **kind 3 が全置換**であること。
    取りこぼした状態で publish すると相手のフォローを消す事故になるので、複数リレーから集めて
    `created_at` が最大のものをベースにする・1 件も取れなければ publish しない、という
    ガードが要る。

- [ ] **相手の投稿へのリアクション / リポスト / 返信**
  - この画面固有ではないが、開いた先で相手の投稿に対して何もできない。ボタンの土台
    （`actions` / `nostr-timeline:action`）は既にあるので、残るのは publish だけ
    （「Nostr Web Components」節と同じ）。

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
