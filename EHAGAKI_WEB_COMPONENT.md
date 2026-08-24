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
  あいだの flex の余り）を `ResizeObserver` で測って px で渡している。ソフトキーボードの
  ぶんを引くために `visualViewport` と `navigator.virtualKeyboard` の両方を見る（`composerHeight`。
  なぜ両方要るかは下記「キーボードで投稿ボタンが隠れる」）。
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

## キーボードで投稿ボタンが隠れる（原因確定・修正済み）

**Android Chrome で報告された不具合。** 本文をタップしてキーボードが出ても投稿フォームは縦長のままで、
フッタの投稿ボタンがキーボードの下に潜ったままになる。

### 原因

**eHagaki が `navigator.virtualKeyboard.overlaysContent = true` を立てる。** Android Chrome かつ
VirtualKeyboard API がある場合に限り、コンポーザのマウント時（`setupViewportListener`）に実行される。
この opt-in は「キーボードでビューポートをリサイズするな、幾何情報は `geometrychange` と
`boundingRect` で受け取る」という宣言なので、**`visualViewport` がキーボードで縮まなくなる**。

combine の高さ計算は `visualViewport` だけを見ていた。縮まないのだから引く物が無く、同じ高さを
書き続ける ―― これが「縦長のまま」の正体。**埋め込んだ相手が、こちらの見ている信号を切っていた。**

実測（Playwright、Android UA、実物のバンドル）:

| | `overlaysContent` | `visualViewport.height` |
|---|---|---|
| compose を開く前 | `false`（既定値） | 844 |
| コンポーザのマウント後 | **`true`** | 844 |
| キーボード（300px）を出した後 | `true` | **844**（縮まない） |

最初は「ページのスクロールで host box の上端がずれるのが原因」と考えたが、これは計算で否定された。
修正前の式は展開すると `要素の下端 = min(hostTop + hostHeight, offsetTop + vh) ≤ 可視領域の下端` で、
スクロールは両辺を同じだけ動かして相殺する。切り分けは 2 段階でやった:

1. **高さをベタ書き（400px）して実機相当で確認** → 効いた（`:host{display:block}`、内側は `height:100%`）。
   書いた高さは要素に伝わる。
2. **`visualViewport` の縮みを偽装して `resize` を投げる** → 645px → 454px に正しく縮んだ。
   購読も式も要素側も正常。**残るのは「その信号が来ない」だけ**で、上の表がその理由だった。

なお eHagaki 自身もコンテナモードでは自前のキーボード補正を持っている（host box のうち隠れている量を
`--main-content-keyboard-adjustment` などに流す）が、**それも動いていない**。適用が `F6()` という
フォーカス判定でゲートされていて、その中身が `document.activeElement` を `[data-post-editor-root]` と
`closest()` で照合するものだから。このセレクタはシャドウルートの中にあり、シャドウ内にフォーカスが
あるとき `document.activeElement` は retarget されてホスト要素を返すので、決して一致しない。
`getSelection()` のフォールバックもシャドウ境界を越えない。**上流のバグ**として要望に出す（下記）。
つまり Android Chrome では、combine 側も eHagaki 側も同時に効かなくなっていた。

### 対応

`composerHeight` が「可視領域の下端」を 2 つの経路から取るようにした。

- **キーボードの矩形**（`navigator.virtualKeyboard.boundingRect`）の高さが 0 でなければ、その `top`。
  Android Chrome で eHagaki が opt-in したあとは、これだけがキーボードの位置を知っている。
- そうでなければ従来どおり `visualViewport`（iOS Safari はこちらが縮む。Android でもコンポーザを
  マウントする前は opt-in されていないのでこちら）。

どちらも host box と同じ client 座標なので、差はページのスクロールに影響されない。購読には
`geometrychange` を追加した。

`overlaysContent` を combine 側から `false` に戻す手もあるが採らない。eHagaki が自分の補正のために
立てているもので、上流が `F6()` を直せば必要になる。読むだけにしておけば衝突しない
（そのとき eHagaki が計算する「隠れている量」は、こちらが下端を合わせるので 0 になる）。

**実機の Android Chrome で確認済み**（報告者の環境）。手元では Playwright で実物の要素に対して
測ってあり（`overlaysContent: true` / `visualViewport` は 844 のまま / キーボード矩形 top 544 →
要素の下端が 735 から **544** に移動）、こちらは偽の `geometrychange` による検証。
**iOS Safari は未確認**で、宿題に残る（そちらは従来どおり `visualViewport` の経路）。

### 続報: 今度は縮みすぎる（原因の切り分け・修正済み・実機未確認）

上の修正のあと、**同じ Android Chrome で逆向きの報告**が来た。キーボードを出すとエディタが
極端に短くなり、キーボードとのあいだに大きな余白ができる。

#### 測定

報告のスクリーンショットから CSS px を割り出した。DPR は既知の 2 つの寸法で押さえられる
——`details` バー（`0.5rem`×2 ＋ `0.9rem`×1.6 ＋ ボーダー ＝ 40.04px）と、eHagaki の
`--footer-height: 66px`（配布バンドルの既定値）。どちらも **2.62** で一致した。

| | CSS px |
|---|---|
| host box の上端 | 90.7 |
| **要素の高さ** | **240.0** |
| キーボードの上端 | 461.7 |
| キーボードの高さ | 346.3 |
| `innerHeight` | 808 |
| 本来あるべき高さ | 371.0 |

240.0 は `MIN_COMPOSER_HEIGHT` そのもの。つまり式は「少しずれた」のではなく**破綻して下限に
張り付いた**（`min(hostHeight, visible) ≤ 240`）。

`hostHeight` が小さかった線は消える。レイアウトが縮んでいたなら `.credit` とタブバーが
要素の下の余白に出ているはずだが、その領域は端から端まで背景色しか無い ——
2 つともキーボードの下に隠れている。`.app` は `min-height: 100dvh` のままで、host box は
618 相当。したがって `visible = 可視領域の下端 - 90.7 ≤ 240`、**渡された下端は本来の 461.7 に
対して 330.7 以下**で、130px 以上ずれていた。ずれの量ではなく、**原点が違う**という桁。

#### 原因と対応

`boundingRect.top` は「host box と同じ client 座標である」という前提の上でしか意味を持たない
値で、実機ではその前提が成り立っていなかった。**高さだけを読むようにした。** 高さには食い違う
原点が無く、キーボードはレイアウトビューポートの下端に接して出るので、
`innerHeight - キーボードの高さ` でこちらの座標系におけるキーボードの上端が再構成できる。

eHagaki 自身も内部では同じことをしている（`B = w - G`、`w` は `window.innerHeight`、`G` は
`boundingRect` を高さへ正規化した値）。そもそも上流に `sve()` という正規化関数がある事実が、
この矩形をそのまま信じてはいけないことの傍証になっている。ただし `sve()` の補正
（矩形の下端がビューポート下端に届かないとき `top` を高さから引く）は真似しない ——
ナビゲーションバーぶん下端に届かない実機ではキーボードの高さが 0 になってしまう。

あわせて、2 つの信号は「どちらを採るか」ではなく**低いほうの下端を採る**ようにした。求めて
いるのは「確実に見えている領域の下端」なので、片方しか縮まない環境でも式は 1 本で済む。
矩形の高さがビューポートより大きい場合は信号ごと捨てる（それはキーボードではない）。

副産物として、ページがスクロールしても結果が動かなくなった。キーボードはドキュメントと
一緒には動かないので、そこから導く下端も動かない。

#### `?viewport-debug`

`https://ocknamo.github.io/combine/?viewport-debug#/compose` のように付けると、`applyHeight` が
使っている数字（host box・`innerHeight`・`visualViewport`・キーボード矩形・書き込んだ高さ）を
画面の左上に重ねて出す。この不具合は devtools を繋げない端末でしか出ず、どの信号が嘘を
ついているかの当て推量に毎回 1 リリース掛かっているため。スクリーンショット 1 枚で
片が付くようにするための逃げ道で、付けない限り何も起きない。

**実機は未確認。** 上の対応が効いているか（またはどの数字が化けているか）は、報告者の端末で
`?viewport-debug` の値を見るのが早い。

## 残っている宿題

- [ ] **実機確認**。モバイルのキーボード挙動（`composerHeight` の visualViewport 補正）と
  動画圧縮を iOS Safari / Android Chrome で通す。
- [ ] **Dexie のバージョンを上流で揃える**（上記）。揃えば `shieldDexieRegistry` は削除できる。
- [ ] **データ移行は無い**。iframe 時代の下書き・設定は引き継がれない（別オリジンの storage）。
- [ ] `composer.focus` 相当は Web Component 版にも無い。TODO の「投稿画面を開いたときに
  エディタへ自動フォーカスする」は移行しても解決しない。

## 上流への要望（本命）

**`F6()` のフォーカス判定をシャドウルート対応にしてもらう。** Web Component 版では
`document.activeElement` が retarget されてホスト要素を返すため `[data-post-editor-root]` に一致せず、
eHagaki 自身のキーボード補正が一度も適用されない（詳細は上記「キーボードで投稿ボタンが隠れる」）。
`mountApp` が作って設定に持っている `domRoot` の `activeElement` を見るか、
`document.activeElement` から `shadowRoot?.activeElement` を辿るだけで済むはずで、差分は小さい。
埋め込み側が高さをどう渡していても効く土台なので、こちらが本筋。

なお `overlaysContent = true` を立てるのはホストのページ全体に効く副作用なので、
**属性か設定でオフにできる**とさらに良い（ホスト側が自前でレイアウトを持っている場合、
`visualViewport` が縮まなくなるのは想定外の挙動になる）。


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
