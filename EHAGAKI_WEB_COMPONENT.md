# eHagaki Web Component 版（`<ehagaki-composer>`）の検討

combine の投稿エディタは eHagaki の iframe 埋め込み（`src/lib/ehagaki.ts`）。
eHagaki が Web Component 版を出したので、乗り換えるかを調べた記録。

**結論: いまは乗り換えない。** 上流に「NIP-07 の自動ログイン（opt-in）」が入るのを待つ。
前提になる `window.nostr` シム（`src/lib/nip07.ts`）だけは先に入れてある。

調査日 2026-08-22。上流の `docs/WEB_COMPONENT.md` / `src/lib/nip07AuthService.ts` /
`src/lib/authRestoreUtils.ts` / `src/web-component/` を読んだ結果。

## 上流が提供しているもの

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

`postMessage` も parent-client の `auth.*` / `rpc.*` も使わない。つまり `src/lib/ehagaki.ts` の
ブリッジは丸ごと不要になる代わりに、認証の受け渡し方を作り直すことになる。

## combine にとっての利点

- **テーマが揃う**。iframe には combine の CSS 変数が届かないので、いまエディタだけ
  見た目が浮いている。Web Component なら金・オリーブのパレットに寄せられる。
- **storage がホスト側に乗る**。ブリッジは `storage.*` / `idb.*` の委譲を実装していないため、
  現状の下書き・設定は eHagaki 側の partitioned storage 頼み（第三者 storage の分離が効く
  ブラウザでは残りにくい）。Web Component は combine のオリジンに
  `ehagaki.web-component.v1:` namespace と IndexedDB `eHagakiDB` で保存する
  （combine のキャッシュ DB は `combine-timeline` なので衝突しない）。
- **ブリッジ（211 行）とそのテストが消える**。`composer.setContext` は要素のメソッド直呼びになり、
  TODO の「本文・メンションのプリフィル」も `setContext({ content })` を呼ぶだけになる。
- `preloadedEvents` があるので、combine が既に持っているイベントを渡して返信・引用の
  プレビューをリレー往復なしで出せる。

## コストとリスク

- **自動ログインが消える**（いちばん大きい）。詳細は下の「認証」。
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

## 認証

Web Component は NIP-07 として**ホストの `window.nostr` を直接使う**。combine は Nosskey の
iframe を直接叩いていて `window.nostr` を生やしていなかったので、シムを足した
（`src/lib/nip07.ts`。nosskey-iframe の README にある想定どおりの使い方）。eHagaki が実際に
呼ぶのは `getPublicKey` と `signEvent` の 2 つだけで、`getRelays` は使わず write リレーは
kind 10002 を自前で取りに行く。

**シムを足しても初回の 1 タップは消えない。** eHagaki は「ログイン済みかどうか」を自分の
storage で判断していて、`window.nostr` は「誰か」しか答えないため。

- 起動時の復元（`runManagedAuthRestore`）は保存済みアカウントがある場合にしか走らない。
  nip07 経路は `waitForExtension()` → `authenticate()`（= `window.nostr.getPublicKey()`）→
  `isExpectedAccount` の照合、という順。
- 保存が無い初回はこの経路に入らず、NIP-07 ログインは `handleNip07Login`（ログインダイアログの
  ボタン）からしか始まらない。`window.nostr` があれば勝手に繋ぐ経路は無い。
- 2 回目以降は無言。タップの結果が combine のオリジンに残り、シムはキャッシュ済みの pubkey を
  返すので Nosskey のパスキー確認も出ない。
- combine 側でアカウントを切り替えると `isExpectedAccount` の照合に落ちる。要素を作り直す
  （`remove()` → 再 `append`）ことで解消する想定。

`getPublicKey` をキャッシュから返すのはこのためでもある。eHagaki は復元時に `authenticate()` を
呼ぶので、Nosskey の iframe へ往復させると起動のたびに不意のパスキー確認が出かねない。

## 上流への要望（本命）

**NIP-07 の自動ログインを opt-in で足してもらう**のがいちばん筋が良い。
`authenticateWithNip07()` は既にあり、いまログインダイアログのボタンからしか呼ばれていない。
「保存済みアカウントが無く、かつ `window.nostr` がある起動時にそれを呼ぶ」だけなので差分が小さい。

opt-in にしてもらう必要はある。NIP-07 拡張は普通 `getPublicKey()` で確認ダイアログを出すので、
無条件だと拡張を入れている人が他の埋め込み先でページを開いただけでプロンプトを踏む。
`auto-login` 属性か `setSettings({ autoLoginNip07: true })` のような明示的なスイッチが要る。

これが入れば、初回タップとアカウント切替の同期（要素の作り直しで拾い直せる）が同時に片付く。

代案として signer 提供 API（例: `configureSigner({ pubkeyHex, signEvent })` を接続前に渡し、
渡された時点でログイン済みとして扱う）もある。iframe 版の parent-client 連携の Web Component 版に
あたるもので、`window.nostr` をページグローバルに生やさずに済む点が優れているが、公開 API が
1 本増えるぶん上流の負担は大きい。ドキュメントに「Web Component 版専用の signer
callback/provider API はありません」と明記されているので、どちらも機能要望として出す話になる。

## host-owned mode（採らない）

`configureHostOwned({ submit, uploadMedia })` を接続前に一度呼ぶと、eHagaki は認証も
リレーも target 取得も始めない。ログイン UI 自体が出なくなるので自動ログインの後退は消え、
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
得られるのは自動ログインの維持と write リレーの選択権だけになる。前者は上の自動ログインで、
後者は eHagaki 自身の kind 10002 取得で解ける類の話で、どちらもこの実装量に見合わない。

なお 3 と 4 は TODO の「publish 経路が要る（本丸）」と同じ土台なので、そちらを別の理由
（リアクション・リポスト・フォロー）で作ったなら、host-owned は後から選べる選択肢として残る。

## 乗り換えるときの手順と宿題

1. 実験ブランチで self-publish の Web Component を動かし、モバイルのキーボード挙動・
   動画圧縮 worker・初回ログイン導線を実機で確認する。
2. 初回 1 タップを許容できるなら、テーマ統合と storage 目当てで乗り換える価値はある。
   上流に自動ログインが入っていれば、その 1 タップも無くなる。
3. 宿題: combine のログアウト・アカウント切替は eHagaki 側の storage に伝わらないので、
   要素の作り直しと namespace の掃除が要る。
4. `ComposeView` は常時マウントをやめ、compose ルートに入ってから要素を生成する。

`composer.focus` 相当は Web Component 版にも無いので、TODO の「投稿画面を開いたときに
エディタへ自動フォーカスする」は Web Component にしても解決しない。
