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
    `auth.relays` を参照するようになった。
  - 残課題（write リレー）: 投稿（publish）は combine 自身ではなく **埋め込みの eHagaki に委譲**
    しており（combine は pubkey 提供と `signEvent` のみ、publish と publish 先リレーは eHagaki 側）、
    `ehagaki.embed` プロトコルに combine → eHagaki へリレーを渡す手段が無い。
    そのため `getRelays()` の write リレーは現状どこにも使われていない。
    ユーザーの write リレーで publish させるには **eHagaki 側プロトコルの拡張提案**（例: `composer.setContext`
    で `relays` を渡す）が必要。
  - 補足: NIP-65（kind 10002）の自分のリレーリストをリレーから取得する案も併用検討可。

## 他ユーザーのプロフィール画面（`#/user/…`）と、そこへの導線

### 現状の整理

- 画面そのものは **半分できている**。`#/user/<npub / nprofile / hex>` は `parseRoute` に
  あり（`routes.ts` / `routes.test.ts`）、`App.svelte` が `ProfileView user={route.param}`
  を描画する。`ProfileView` は `own` が false なら鍵の管理・ログアウトを出さず、
  `nostr-profile` のカード＋その人の kind 1 一覧（`TimelineEmbed`）＋npub コピーを出す。
- 足りていないのは **導線と、ドリルダウン画面としての体裁**。
  - アプリ内から `#/user/…` へ飛ぶリンクが **1 つも無い**（`grep '#/user'` はテストしか
    ヒットしない）。URL を直接叩かない限り到達できない。
  - `PostView` にある `BackBar` が無いので、戻る手段がタブバーしかない。
  - 検索結果のプロフィールカードは `SearchView` 内に直接出るだけで、ユーザー画面へ
    遷移しない（＝同じ内容が 2 か所にある状態）。

### 「ユーザーアイコンからリンク」の実現性

タイムラインの投稿カードは nostr-cache（`nostr-timeline` / `nostr-follow-timeline` /
`nostr-post`）が Shadow DOM 内に描画する。バンドル（`https://ocknamo.github.io/nostr-cache/nostr-timeline.js`）
を読んで確認した事実:

- アイコンは `<img class="avatar" part="avatar">`（プロフィール画像が無い場合は
  `<span class="avatar fallback" part="avatar">`）。**リンクにも button にもなっておらず、
  クリック用のイベントも出さない**。
- ウィジェットが投げるカスタムイベントは `nostr-timeline:action` **のみ**。
  detail は `{ actionId, event, status }` で、`event` は完全な Nostr イベント＝**pubkey を含む**。
- アクションボタンは `data-action="<id>"` と `part="action action-<id>"` を持ち、
  1 カードあたり最大 8 個まで置ける（超過分は警告して無視される）。
- 内部コンポーネントは custom element として define されていない（define されているのは
  3 タグだけ）ので、`part` は全部 **ホストから 1 段で届く**。
  → `nostr-timeline::part(avatar) { cursor: pointer }` のような装飾は外から可能。
- アイコンから pubkey を引く公式な口は無い。実装詳細としては投稿ヘッダの
  `<span class="identity" title="<hex pubkey>">` に pubkey が入っているが、
  これは文書化されていない内部実装。

つまり **「アイコンそのものをリンクにする」は、今の nostr-cache では素直にはできない**。

### 進め方（推奨）

1. **まず今すぐできる形で導線を通す（nostr-cache の公式 API だけで完結）**
   - `POST_ACTIONS_ATTR`（`postRef.ts`）に 2 つ目のアクション
     `{ id: 'profile', label: 'プロフィール', icon: 'person' }` を足す。
   - `postActionPath` を actionId で分岐させ、`profile` は
     `/user/<npub>`（`toNpub(event.pubkey)`）を返す。詳細ボタン用の
     「kind 6/7/9735 は `e` タグを辿る」ルールは **適用しない**。通知タブでは
     「リアクションした本人」を開くのが自然なので、`event.pubkey` をそのまま使う。
   - `PostView` の `nostr-post` にも `actions` を付ける（`profile` だけ。`detail` は
     自分自身へのリンクになるので現状どおり付けない）。
   - これでホーム / 通知 / プロフィールの投稿 / 検索結果すべてのカードから
     ユーザー画面へ行けるようになる。
2. **画面側の仕上げ**
   - `ProfileView` に `own` でないとき `BackBar label="ユーザー"` を出す（`PostView` と同じ形）。
   - URL に載せる識別子は **npub** を推奨（人間が読める・共有できる。`parseRoute` は
     hex/nprofile もそのまま受けるし `toHexPubkey` が吸収する）。
   - `SearchView` のプロフィールカードは `href="#/user/{id}" target="_self"` にできる
     （`nostr-profile` の `href` は `{id}` を `user` 属性の値でそのまま置換する。
     `target` の既定は `_blank` なので `_self` の明示が必要）。カード自体を
     ユーザー画面への入口にすれば、検索ビューから投稿一覧の重複を外せる。
   - 自分自身の pubkey で `#/user/…` を開いた場合の扱い（`#/profile` へ寄せるか、
     そのまま他人と同じ表示にするか）を決める。
3. **アイコン自体をリンクにするのは nostr-cache 側の拡張が要る**（ocknamo/nostr-cache）
   - 案 A（推奨）: `author-href="#/user/{pubkey}"` のようなテンプレート属性を足し、
     アイコンと表示名を `<a>` で包む。JS 不要で、右クリック・新しいタブ・
     スクリーンリーダーが全部そのまま効く。既存の `actions` と同じ
     「ホストが挙動を決める」流儀にも合う。
   - 案 B: アイコン/名前のクリックで `nostr-timeline:profile`（detail に `pubkey`）を出す。
   - 案 C（最小）: アイコンか `<article>` に `data-pubkey` を出すだけ。ホスト側で
     capture フェーズの click + `composedPath()` から拾える。
   - 案 A が入るまでの繋ぎとして、combine 側で「アイコンのクリックを拾って、同じカードの
     `button[data-action="profile"]` を `.click()` する」ことは技術的には可能だが、
     内部 DOM 構造への依存になるので、上流に投げるほうを優先したい。

### やらないこと（今回のスコープ外）

- フォロー / フォロー解除ボタン: kind 3 の publish が要る。publish 経路が無いのは
  上の「Nostr Web Components」節と同じ未解決事項。
- 「この人にメンションして投稿」: `composer.setContext` の `content` に
  `nostr:npub…` を渡せば実現できる（ブリッジは対応済み・UI 未使用）。
  他ユーザー画面はその入口として自然なので、上記が済んだあとの候補。
