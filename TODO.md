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
