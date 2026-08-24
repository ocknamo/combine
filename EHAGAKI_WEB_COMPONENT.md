# eHagaki Web Component 版（`<ehagaki-composer>`）への移行

combine の投稿エディタは eHagaki の埋め込み。iframe（`ehagaki.embed` の postMessage ブリッジ）から
**Web Component 版に移行した**。この文書は移行の判断・実装・残っている宿題の記録。

調査日 2026-08-22。上流の `docs/WEB_COMPONENT.md` と配布中のバンドル
（`https://lokuyow.github.io/ehagaki/web-component/`）を読んだ結果。

## 判断

初回のログインに **エディタ内で 1 タップ必要になる**（下記「認証」）。この 1 点だけが後退で、
それ以外はすべて前進なので、1 タップを許容して移行した。

**その 1 タップは消えた。** 要望に出していた NIP-07 の自動ログインが上流に入り
（[Lokuyow/ehagaki#188](https://github.com/Lokuyow/ehagaki/pull/188)）、`auto-login` 属性を
付けるだけで済むようになった（下記「認証」）。移行時に払った唯一の代償がこれで無くなり、
判断としては前進だけが残った。

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
- **認証**: 生成時に `auto-login` 属性を付ける。eHagaki が保存済みアカウントを復元できないとき、
  combine の `window.nostr` シムでそのままログインする（下記「認証」）。
- **エラー**: `ehagaki-post-error` の detail は `{ code }` だけで、iframe 時代にあった `message` が無い。
  日本語メッセージは combine 側で持つ（`postErrorMessage`）。`empty_content` は eHagaki 自身が
  UI で言うのでトーストは出さない。

## 認証

Web Component は NIP-07 として**ホストの `window.nostr` を直接使う**。combine は Nosskey の
iframe を直接叩いていて `window.nostr` を生やしていなかったので、シムを足してある
（`src/lib/nip07.ts`）。eHagaki が実際に呼ぶのは `getPublicKey` と `signEvent` の 2 つだけで、
`getRelays` は使わず write リレーは kind 10002 を自前で取りに行く。

### 自動ログイン（`auto-login`）

**かつては、シムがあっても初回に 1 タップ必要だった。** eHagaki は「ログイン済みかどうか」を
自分の storage で判断していて、`window.nostr` は「誰か」しか答えない。保存が無い初回は
起動時の復元経路に入らず、NIP-07 ログインはログインダイアログのボタンからしか始まらなかった。

上流に **`auto-login` 属性**が入って（[#188](https://github.com/Lokuyow/ehagaki/pull/188)、
要望していたとおりの opt-in）、そこが埋まった。保存済みアカウントをすべて評価しても未認証だった
場合に限り、ホストの `window.nostr` で NIP-07 ログインを試す。combine は
`createComposer()` で常に付けている。

- **既定は無効**で、それが正しい。NIP-07 拡張はたいてい `getPublicKey()` で確認ダイアログを出すので、
  無条件だと拡張を入れている人が埋め込み先を開いただけでプロンプトを踏む。**combine はこの属性の
  想定ケースそのもの**で、シムはログイン済みのセッションから答え、要素はそのアカウントのためにしか
  作られない（`ComposeView` は `auth.pubkey` が無ければ組み立てない）。だからプロンプトは出ない。
- **接続前に付ける必要がある**。`asset-base` と同じく mount 時に読まれるので、
  `createComposer()` が要素を作った直後、`appendChild` の前に置いている。
- **属性で付けている**（`element.autoLogin = true` ではなく）。GitHub Pages のキャッシュで古い
  バンドルが来ても、知らない属性は無視されるだけで済む。壊れずに 1 タップに戻るだけ。
- **`whenReady()` の意味が変わる**。この属性がある Full 版では、認証後（あるいは失敗後のゲスト）の
  bootstrap まで待ってから解決する。準備完了は少し遅くなるが、その代わり ready な要素は
  「誰として投稿するか決まっている要素」になる。
- 失敗しても静かにゲストで起動する（拡張未検出・ユーザー拒否など）。自動試行は 1 mount につき 1 回。

残る挙動:

- 2 回目以降は元から無言だった。結果が combine のオリジンに残り、シムはキャッシュ済みの pubkey を
  返すので Nosskey のパスキー確認も出ない。
- combine 側でアカウントを切り替えると保存済みアカウントとの照合（`isExpectedAccount`）に落ちる。
  要素を作り直して拾い直すのは変わらないが、**作り直したあとが無言になった**：以前はそこで
  ログインダイアログが出ていて、切り替えのたびに 1 タップ要った。ログアウト時に
  `ehagaki.web-component.v1:` を消したあとの再ログインも同じ。

`getPublicKey` をキャッシュから返すのはこのためでもある。eHagaki は復元時にも自動ログイン時にも
`authenticate()` を呼ぶので、Nosskey の iframe へ往復させると起動のたびに不意のパスキー確認が
出かねない。

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

### 続報: 今度は縮みすぎる（原因確定・修正済み・実機確認済み）

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

#### 実機の値（Android Chrome・報告者の端末）

原因を突き止めるあいだ、`applyHeight` が使っている数字（host box・`innerHeight`・
`visualViewport`・キーボード矩形・書き込んだ高さ）を画面に重ねて出す `?viewport-debug` を
仕込んでいた（devtools を繋げない端末でしか出ない不具合なので、スクリーンショット 1 枚で
片が付くようにするため）。**このデバッグ表示は削除済み**。以下はそれで撮ってもらった、
キーボードを出した状態の数字:

```
height 371.3 / host 91.7+585.2
inner 785 dpr 2.625 scrollY 0
vv 0.0+785.5 w411 x1
kb top 49.0 h 322.0 bottom 371.0 w 411
```

**矩形の高さ 322 と幅 411 は正しく、位置だけがずれていた。** キーボードの本当の上端は
`785 - 322 = 463` で、報告された `top` は 49 ——414px 上を指していた。`visualViewport` が
キーボードを出しても 785.5 のままである（＝ `overlaysContent` で縮まない）ことも、上の節の
筋書きどおりに確認できた。

つまり原因は矩形の**平行移動**で、高さは無事だった。高さだけを読む修正がそのまま効く型で、
実際 371.3 が書き込まれ、フッタがキーボードの真上に載った（幾何学的な理想値は 371.0）。

不気味な一致として、`bottom`（371.0）は「キーボードの真の上端から host box の上端を引いた値」
（462.7 − 91.7 = 371.0）と一致する。原点が host box 基準になっているように見えるが、
どの座標系のつもりなのかは分からない。**分からなくて構わない、というのが今回の修正の要点**で、
高さしか読まなければ原点の解釈に依存しない。

**iOS Safari は依然として未確認。** そちらを見るときに同じ数字が要るなら、`applyHeight` の
値を出す表示を一時的に入れ直せばよい（上の実測はその形式）。

## 残っている宿題

- [ ] **実機確認**。モバイルのキーボード挙動（`composerHeight` の visualViewport 補正）と
  動画圧縮を iOS Safari / Android Chrome で通す。`auto-login` も実機で無言に繋がるかを見る
  （手元では確認していない。理屈の上ではシムがキャッシュから答えるのでプロンプトは無い）。
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


### NIP-07 の自動ログイン（**入った**）

**要望していた opt-in がそのままの形で実装された**
（[#188](https://github.com/Lokuyow/ehagaki/pull/188)）。`auto-login` 属性で、保存済みアカウントを
どれも復元できなかったときだけホストの `window.nostr` を使う。既定は無効、Full 配布専用。
combine 側は属性を 1 つ足しただけで初回 1 タップが消えた（上記「認証」）。

代案として挙げていた signer 提供 API（`configureSigner({ pubkeyHex, signEvent })` を接続前に渡す形）は
出さないままでよい。`window.nostr` をページグローバルに生やさずに済む点は今も優れているが、
combine は Nosskey のシムを既に生やしていて他に得るものが無く、上流には公開 API が 1 本増える。

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
