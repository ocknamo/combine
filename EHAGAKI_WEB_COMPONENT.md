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
  あいだの flex の余り）を `ResizeObserver` で測って px で渡している。加えて `visualViewport` も
  見る: iOS のソフトキーボードはページをリサイズしないので、レイアウト上の高さのまま渡すと
  エディタのフッタ（投稿ボタン）がキーボードの下に潜る（`composerHeight`）。
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

## 残っている宿題

- [ ] **実機確認**。モバイルのキーボード挙動（`composerHeight` の visualViewport 補正）と
  動画圧縮を iOS Safari / Android Chrome で通す。CI・サンドボックス環境からは
  クロスオリジンのバンドルを実際に読ませられなかったので、ここは手で見るしかない。
- [ ] **データ移行は無い**。iframe 時代の下書き・設定は引き継がれない（別オリジンの storage）。
- [ ] `composer.focus` 相当は Web Component 版にも無い。TODO の「投稿画面を開いたときに
  エディタへ自動フォーカスする」は移行しても解決しない。

## 上流への要望（本命）

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
