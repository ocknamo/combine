# eHagaki Web Component 版（`<ehagaki-composer>`）への移行

combine の投稿エディタは eHagaki の埋め込み。iframe（`ehagaki.embed` の postMessage ブリッジ）から
**Web Component 版に移行した**。この文書は移行の判断・実装・残っている宿題の記録。

調査日 2026-08-22。上流の `docs/WEB_COMPONENT.md` と配布中のバンドル
（`https://lokuyow.github.io/ehagaki/web-component/`）を読んだ結果。

## 判断

初回のログインに **エディタ内で 1 タップ必要になる**（下記「認証」）。この 1 点だけが後退で、
それ以外はすべて前進なので、1 タップを許容して移行した。上流に NIP-07 の自動ログインが入れば
その 1 タップも消える（下記「上流への要望」）。

得たもの:

- **テーマが揃う**。iframe には combine の CSS 変数が届かず、エディタだけ見た目が浮いていた。
  Web Component は `--ehagaki-*` トークンで金・オリーブのパレットに寄せられる
  （`ComposeView.svelte` の `.composer` に置いてある。カスタムプロパティは継承するので、
  マークアップに出てこない要素にも届く）。
- **storage がホスト側に乗る**。ブリッジは `storage.*` / `idb.*` の委譲を実装していなかったため、
  下書き・設定は eHagaki 側の partitioned storage 頼みで、第三者 storage の分離が効くブラウザでは
  残らなかった。いまは combine のオリジンに `ehagaki.web-component.v1:` namespace と
  IndexedDB `eHagakiDB` で保存される（combine のキャッシュ DB は `combine-timeline` なので衝突しない）。
- **ブリッジ（211 行）とそのテストが消えた**。`composer.setContext` は要素のメソッド直呼びになり、
  TODO の「本文・メンションのプリフィル」も `setContext({ content })` を呼ぶだけになった。
- 返信・引用のプレビューを親の持っているイベントで即出せる `preloadedEvents` が使える
  （combine は自前のイベント取得経路をまだ持たないので未使用）。

## 実装

`src/lib/ehagakiComposer.ts`（ローダと型）＋ `src/lib/components/ComposeView.svelte`。

- **読み込み**: `import()` にランタイムの URL を渡す（`@vite-ignore`）。エントリは 185 バイトの
  再エクスポートで、本体は隣のチャンク（約 2.7MB）を動的 import する。import した時点で
  `customElements.define` まで走る（`customElements.get` のガード付き）ので、
  `customElements.whenDefined` で待てる。GitHub Pages が `access-control-allow-origin: *` を
  返すのでクロスオリジンで読める。
- **生成タイミング**: compose タブに **初めて入ったときだけ**生成し、以後は保持する。
  常時マウントだと 2.7MB の読み込みと Tiptap の初期化がアプリ起動時にメインスレッドへ乗るため。
  タブを離れても壊さないのは、下書きと初期化コストを 2 回払わないため
  （`App.svelte` が `active` を渡し、`ComposeView` がそれを見て組み立てる）。
- **高さ**: 要素は definite な CSS height が必須で `auto` は非対応。host box（ヘッダとタブバーの
  あいだの flex の余り）を `ResizeObserver` で測って px で渡している。ソフトキーボードが開いている
  あいだは高さを渡すだけでは足りず、可視領域そのものに貼り付ける（`composerBox`。下記
  「キーボードで投稿ボタンが隠れる」）。
- **設定**: `setSettings({ locale: 'ja', themeMode: 'light', clientTagEnabled: true })`。
  iframe 時代のクエリ（`defaultLocale` / `embedClientTag`）と同じ内容。`light` 固定なのは
  combine が light 専用テーマ（`color-scheme: light`）だから。
- **ログアウト・アカウント切替**: eHagaki は「誰がログイン中か」を自分の storage で判断するので、
  pubkey が変わったら要素を作り直す。ログアウト時は `ehagaki.web-component.v1:` を全消しする
  （下書きと「ログイン中の相手」が combine のオリジンに残るため。同じ端末の次の人に
  前の人の書きかけが見えてはいけない）。代償として eHagaki 側の設定も消える。
- **エラー**: `ehagaki-post-error` の detail は `{ code }` だけで、iframe 時代にあった `message` が無い。
  日本語メッセージは combine 側で持つ（`postErrorMessage`）。`empty_content` は eHagaki 自身が
  UI で言うのでトーストは出さない。

## 認証

Web Component は NIP-07 として**ホストの `window.nostr` を直接使う**。combine は Nosskey の
iframe を直接叩いていて `window.nostr` を生やしていなかったので、シムを足してある
（`src/lib/nip07.ts`）。eHagaki が実際に呼ぶのは `getPublicKey` と `signEvent` の 2 つだけで、
`getRelays` は使わず write リレーは kind 10002 を自前で取りに行く。

**シムがあっても初回の 1 タップは消えない。** eHagaki は「ログイン済みかどうか」を自分の storage で
判断していて、`window.nostr` は「誰か」しか答えないため。

- 起動時の復元（`runManagedAuthRestore`）は保存済みアカウントがある場合にしか走らない。
  nip07 経路は `waitForExtension()` → `authenticate()`（= `window.nostr.getPublicKey()`）→
  `isExpectedAccount` の照合、という順。
- 保存が無い初回はこの経路に入らず、NIP-07 ログインは `handleNip07Login`（ログインダイアログの
  ボタン）からしか始まらない。`window.nostr` があれば勝手に繋ぐ経路は無い。
- 2 回目以降は無言。タップの結果が combine のオリジンに残り、シムはキャッシュ済みの pubkey を
  返すので Nosskey のパスキー確認も出ない。
- combine 側でアカウントを切り替えると `isExpectedAccount` の照合に落ちる。要素を作り直すことで
  拾い直す（実装済み）。

`getPublicKey` をキャッシュから返すのはこのためでもある。eHagaki は復元時に `authenticate()` を
呼ぶので、Nosskey の iframe へ往復させると起動のたびに不意のパスキー確認が出かねない。

## 信頼境界

lokuyow.github.io の JS が combine の realm で動く（DOM・storage・`window.nostr` シムにフルアクセス）。
上流ドキュメントも「ホスト JS から秘密情報を隔離したいなら iframe を使え」と明記している。

秘密鍵は依然として combine にも eHagaki にも渡らない（署名は nosskey.app の iframe の中だけで起き、
そこが独自の同意ダイアログでゲートする）ので README の「秘密鍵はこのアプリに渡りません」は維持できる。
変わったのは**エディタのコードが同じページで動くこと**で、README にその旨を書き足した。

## クロスオリジンの worker（解決済み）

動画圧縮の ffmpeg.wasm は `new Worker(new URL("worker-….js", import.meta.url), { type: "module" })` で
worker を作る。これはクロスオリジンだと SecurityError になるが、**上流が対応済み**だった:
`createClassWorkerBlobURL` が「worker の URL の origin がホストと違うとき」だけ fetch して
blob URL に包み、`classWorkerURL` として渡している。画像圧縮
（browser-image-compression）も元から blob worker。combine は CSP を設定していないので
`worker-src` 側の制約も無い。

とはいえ実機（特に iOS Safari）で動画を通したことはまだ無い。下記の宿題に残す。

## Dexie の衝突（同じ realm に載せた代償）

**移行後に実際に踏んだ不具合。** compose を開くと「エディタを読み込めませんでした」になり、
リロードで直ったり直らなかったりした。真の原因は上流の `catch {}` に握り潰されていて、
表に出ていたのは `initialization_failed` だけだった。中身はこれ:

```
Error: Two different versions of Dexie loaded in the same app: 4.4.2 and 4.4.4
```

nostr-cache と eHagaki が**それぞれ別バージョンの Dexie を同梱**している
（eHagaki 4.4.2 / nostr-cache 4.4.4）。Dexie は `globalThis[Symbol.for('Dexie')]` を
レジストリにしていて、先に読み込んだ方がスロットを取り、後から来た別バージョンが throw する:

```js
const shared = globalThis[SYM] || (globalThis[SYM] = mine);
if (mine.semVer !== shared.semVer) throw new Error(...);
```

iframe 時代は別ドキュメントだったので起きなかった。**同じ realm に載せた直接の代償**で、
「信頼境界」と並ぶ移行のコストとして数えるべきものだった。

どちらが先に読み込まれるかは競争になる（リレーのバンドルは起動時、コンポーザのバンドルは
compose を初めて開いたとき）。だから症状が「たまに動く」になっていた。

combine 側の対処は `shieldDexieRegistry`（`ehagakiComposer.ts`）。コンポーザを組み立てている
あいだだけスロットを「読むと空」に見せ、終わったら最初の持ち主に返す。両者は別の DB
（`combine-timeline` / `eHagakiDB`）を開くだけで接続を共有しないので、2 つの Dexie が同居しても
実害は無い。あの検査は「同じ Dexie を二重にバンドルしてしまった」を捕まえるためのもの。

**本筋の直し方は上流でバージョンを揃えること。** nostr-cache は combine と同じ作者の管理下に
あるので、そちらを eHagaki と同じ 4.4.2 に寄せる（あるいは eHagaki に 4.4.4 へ上げてもらう）のが
素直で、揃った時点でこの回避策は要らなくなる。

## キーボードで投稿ボタンが隠れる（暫定対応・真因は未確定）

**実機で報告された不具合。** モバイルで本文をタップしてキーボードが出ても投稿フォームは縦長のままで、
フッタの投稿ボタンがキーボードの下に潜ったままになる。

### 分かっていること 1: 修正前の式そのものは間違っていなかった

最初は「ページがスクロールして host box の上端がずれるのが原因」と考えたが、**これは計算で否定された。**
修正前の `composerHeight` を展開すると

```
要素の下端 = hostTop + min(hostHeight, offsetTop + vh - hostTop)
           = min(hostTop + hostHeight, offsetTop + vh)   ≤ 可視領域の下端
```

で、スクロールは `hostTop` と `visible` を同じだけ動かして相殺する。つまり**再計算さえ走れば、
スクロールの有無にかかわらず要素の下端が可視領域を越えることはない**（`MIN_COMPOSER_HEIGHT` を
下回る極端な場合を除く）。実際にキーボードを開いた条件を並べると、投稿ボタンが隠れる組み合わせは
**「再計算が走っていない（キーボード前の高さのまま）」だけ**だった。

報告が「縦長の**まま**」だったことも、高さが一度も更新されていないことを示している。
つまり真因は式ではなく「`applyHeight` が呼ばれていない、または呼ばれても効いていない」側にある。
そこまでは詰められたが、**どちらなのかは実機の数字を見ないと確定しない。**

### 分かっていること 2: eHagaki 自身のキーボード補正が Web Component 版では死んでいる

配布バンドルを読んだ結果。`layoutMode: "container"`（Web Component 版はこれ）のとき、eHagaki は
**自分でキーボードを検出して自分の中身を持ち上げる**処理を持っている。host box の矩形のうち
キーボードに隠れている量を出し（`min(rect.height, max(0, rect.bottom - 可視領域の下端))`）、
`--main-content-keyboard-adjustment` などの CSS 変数に流す。`visualViewport` の `resize`/`scroll`、
`focusin`/`focusout`、`window` の `scroll` まで購読していて、作り自体はしっかりしている。

ところがその適用は `F6()` というフォーカス判定でゲートされていて、その中身が

```js
const TM = "[data-post-editor-root]";
const e = document.activeElement;
if (e?.closest(TM)) return true;
if (e && e !== document.body && e !== document.documentElement) return false;  // ← ここに落ちる
```

`[data-post-editor-root]` は**シャドウルートの中**にある。フォーカスがシャドウ内にあるとき
`document.activeElement` は retarget されてホスト要素（`<ehagaki-composer>`）を返し、その `closest()` は
light DOM の祖先しか辿らないので一致しない。`getSelection()` のフォールバックもシャドウ境界を越えない。
**結果 `F6()` は常に false になり、`--keyboard-height` も `--footer-bottom` も 0 のまま**になる。
iframe 時代（シャドウ無し・別ドキュメント）では成立していた判定が、Web Component 版で成立しなくなっている。

これは「エディタ側が何もしてくれない」ことの説明であって、combine 側の高さが更新されなかった理由の
説明ではない。**独立した 2 つ目の要因**として数え、上流に投げる（下記「上流への要望」）。

### 対応: キーボード中は可視領域に貼る（`composerBox`）

真因が「更新されていない」側にある以上、式を薄く直しても裏付けが無い。より外れにくい形として、
キーボードが開いているあいだは要素を**可視領域そのものに fixed で貼る**ことにした。
`position: fixed` は layout viewport 基準なので `top` に `visualViewport.offsetTop`、高さに
`visualViewport.height` を入れると可視領域にちょうど重なる。左右は host box のものを使う
（`max-width: 640px` のセンタリングを引き継ぐ）。入力中はエディタがヘッダとタブバーの上に乗る
全画面になり、フッタがキーボードの真上に来る。z-index は 20（署名オーバーレイの 1000 より下 —
エディタから署名へ進めなくなるため）。

貼り付けには副次的な利点がある。host box の下端が可視領域の下端に一致するので、上記の eHagaki 側の
補正量（隠れている量）が 0 になる。**上流が `F6()` を直しても二重に持ち上がらない。**

判定は「layout viewport（`documentElement.clientHeight`）より visual viewport が
`KEYBOARD_THRESHOLD`=120px 以上短い」。ブラウザ UI や iOS のアクセサリバーが削るのは数十 px、
キーボードは画面の 1/3 以上で、あいだは十分に空いている。ピンチズームも visual viewport を
縮めるので `scale` で弾く（ズーム中に貼り付けるとパンと喧嘩する）。閾値以下では従来どおり flow の
まま可視領域の下端で頭打ちにする。貼り付け中は `MIN_COMPOSER_HEIGHT` を効かせない: 可視領域より
高くしたらフッタがまた潜るため。

**ただしこの対応は、修正前と同じ購読（`ResizeObserver` と `visualViewport` のイベント。加えて
`window` の `scroll`）の上に乗っている。** もし真因が「イベントが来ていない」側だったなら、
この対応も同じように効かない。だから次は実機の数字を取る。

### 実機で確かめる: `viewport-probe.html`

リポジトリ直下の `viewport-probe.html`（dev サーバ専用。`public/` に無いのでビルドには入らない）。
`npm run dev -- --host` してスマホから `/viewport-probe.html` を開く。compose 画面と同じ骨格
（100dvh の縦 flex・sticky のヘッダとタブバー・余りの host box・シャドウルート・下端のフッタ）を
再現してあり、編集領域をタップすると次が出る:

- `visualViewport` の height / offsetTop / scale、`innerHeight`、`clientHeight`、`scrollY`、host box と要素の矩形
- **各イベントの発火回数**（`vvResize` / `vvScroll` / `winScroll` / `resizeObs`）。0 のままなら真因は「来ていない」側
- フッタが可視領域を越えているかの判定
- `document.activeElement` と `shadowRoot.activeElement`、および上流の `F6()` を再現した値
  （false が出れば上記 2 の裏付けになる）
- 「何もしない / flow（修正前）/ pinned（修正後）」の切り替え。どれで投稿ボタンが見えるかを直接見る

## 残っている宿題

- [ ] **実機確認**。上記のキーボード対応（`composerBox`）と動画圧縮を
  iOS Safari / Android Chrome で通す。
- [ ] **Dexie のバージョンを上流で揃える**（上記）。揃えば `shieldDexieRegistry` は削除できる。
- [ ] **データ移行は無い**。iframe 時代の下書き・設定は引き継がれない（別オリジンの storage）。
- [ ] `composer.focus` 相当は Web Component 版にも無い。TODO の「投稿画面を開いたときに
  エディタへ自動フォーカスする」は移行しても解決しない。

## 上流への要望（本命）

**`F6()` のフォーカス判定をシャドウルート対応にしてもらう。** Web Component 版では
`document.activeElement` が retarget されてホスト要素を返すため、`[data-post-editor-root]` に
一致せず、eHagaki 自身のキーボード補正（`--keyboard-height` / `--footer-bottom` /
`--main-content-keyboard-adjustment`）が一度も適用されない（詳細は上記
「キーボードで投稿ボタンが隠れる」）。`domRoot`（`mountApp` が `attachShadow` で作り、設定に
持っている）の `activeElement` を見る、あるいは `document.activeElement` から
`shadowRoot?.activeElement` を辿って掘るだけで済むはずで、差分は小さい。埋め込み側が
高さをどう渡していても効く土台なので、こちらが本筋。


**NIP-07 の自動ログインを opt-in で足してもらう**のがいちばん筋が良い。
`authenticateWithNip07()` は既にあり、いまログインダイアログのボタンからしか呼ばれていない。
「保存済みアカウントが無く、かつ `window.nostr` がある起動時にそれを呼ぶ」だけなので差分が小さい。

opt-in にしてもらう必要はある。NIP-07 拡張は普通 `getPublicKey()` で確認ダイアログを出すので、
無条件だと拡張を入れている人が他の埋め込み先でページを開いただけでプロンプトを踏む。
`auto-login` 属性か `setSettings({ autoLoginNip07: true })` のような明示的なスイッチが要る。

代案として signer 提供 API（例: `configureSigner({ pubkeyHex, signEvent })` を接続前に渡し、
渡された時点でログイン済みとして扱う）もある。iframe 版の parent-client 連携の Web Component 版に
あたるもので、`window.nostr` をページグローバルに生やさずに済む点が優れているが、公開 API が
1 本増えるぶん上流の負担は大きい。ドキュメントに「Web Component 版専用の signer
callback/provider API はありません」と明記されているので、どちらも機能要望として出す話になる。

## host-owned mode（採らない）

`configureHostOwned({ submit, uploadMedia })` を接続前に一度呼ぶと、eHagaki は認証も
リレーも target 取得も始めない。ログイン UI 自体が出なくなるので初回 1 タップは消え、
publish 先も combine が決められる（TODO の「リレー設定」の write リレー問題も片付く）。

ただし代わりに combine が持つことになるものが大きい:

1. イベント組み立て。`submit` に来るのは `{ content, tags, context }` で、`tags` は
   hashtag / CW / カスタム絵文字 / imeta だけ。`kind` / `pubkey` / `created_at` と
   `e` / `p` / `q` / `a` / `k`（NIP-10・NIP-18）は combine が作る。
2. 署名 → `auth.signEvent` で既にできる（ここだけは追加コストが無い）。
3. write リレーへの publish → 生 WebSocket で `["EVENT", ev]` を投げて `["OK", id, true]` を待つ。
4. `uploadMedia` → 省略すると **text-only composer** になり、画像・動画圧縮という eHagaki の
   看板機能を失う。実装するなら NIP-96 + NIP-98 を自前で持つ。

**実装量の割に得るものが少ないので採らない。** そもそも eHagaki を埋め込む理由は、エディタと
メディアの圧縮・アップロードをまるごと借りることにある。4 を自前で持つ時点でその理由が薄れ、
得られるのは初回 1 タップの解消と write リレーの選択権だけになる。前者は上の自動ログインで、
後者は eHagaki 自身の kind 10002 取得で解ける類の話で、どちらもこの実装量に見合わない。

なお 3 と 4 は TODO の「publish 経路が要る（本丸）」と同じ土台なので、そちらを別の理由
（リアクション・リポスト・フォロー）で作ったなら、host-owned は後から選べる選択肢として残る。
