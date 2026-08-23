# TODO / 検討メモ

アプリ改善の議論で出た「実現性の相談」事項と、今後の改善候補をまとめたメモ。
※コード変更済みのものはここには含めない（このファイルは未着手の検討事項用）。

## eHagaki（投稿エディタ）連携

※ Web Component 版（`<ehagaki-composer>`）への移行は**対応済み**。経緯・実装・宿題は
`EHAGAKI_WEB_COMPONENT.md` を参照。以下はその上で残っているもの。

- [ ] **キーボードで投稿ボタンが隠れる件の真因を実機で確定させる**
  - 暫定対応は入れた（`composerBox`。キーボード中は可視領域に fixed で貼る）。ただし
    **真因は未確定**: 修正前の式自体は計算上正しく、隠れるのは「高さの再計算が走っていない」
    場合だけだった。イベントが来ていないのか、書いた高さが効いていないのかは実機の数字待ち。
  - `viewport-probe.html`（dev サーバ専用）をスマホで開いて、イベント発火回数と矩形を読む。
    経緯と読み方は `EHAGAKI_WEB_COMPONENT.md`。
  - 上流にも投げる: `F6()` がシャドウルートのフォーカスを見られず、eHagaki 自身の
    キーボード補正が Web Component 版で一度も効かない。

- [ ] **動画圧縮を実機で通す**
  - クロスオリジンの worker は上流が対応済み（blob URL 経由）だが、実機で通したことはまだ無い。

- [ ] **Dexie のバージョンを nostr-cache と eHagaki で揃える**
  - 両者が別バージョンを同梱していて（4.4.4 / 4.4.2）、同じ realm に載せると後から
    読み込んだ方が throw する。いまは combine 側で回避している（`shieldDexieRegistry`。
    経緯は `EHAGAKI_WEB_COMPONENT.md`）。
  - nostr-cache 側を 4.4.2 に寄せれば回避策を消せる。上流の実装依存が減る。

- [ ] **eHagaki 側の初回ログイン 1 タップを消す**
  - 上流に **NIP-07 の自動ログイン（opt-in）** を足してもらうのが本命。差分は小さい
    （`authenticateWithNip07()` は既にあり、ログインダイアログのボタンからしか呼ばれていない）。
  - combine 側で先回りできることは無い。`window.nostr` シムは入っていて、それでも消えない
    （eHagaki は「ログイン済みか」を自分の storage で判断するため）。

- [ ] **投稿画面を開いたときにエディタへ自動フォーカスする**
  - 公開 API としては依然として無い（`composer.focus` 相当は Web Component 版にも無い）。
  - ただし open ShadowRoot なので、中の contenteditable を探して `.focus()` すること自体は
    できるようになった。上流の DOM 構造に依存するので、やるなら壊れる前提の実装になる。
  - モバイルはユーザー操作と非同期なフォーカスではソフトキーボードが開かない制約も残る。
  - → 素直に実現するには **上流へのフォーカス API の要望** が要る。

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
    しており（combine は `window.nostr` 経由で pubkey と `signEvent` を出すだけ、publish と
    publish 先リレーは eHagaki 側）、Web Component にもリレーを渡す口が無い（eHagaki は
    kind 10002 を自前で取りに行く。`getRelays` も呼ばない）。
    そのため `getRelays()` の write リレーは現状どこにも使われていない。
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
