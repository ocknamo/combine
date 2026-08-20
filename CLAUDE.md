# CLAUDE.md

combine（Nostr クライアント / Svelte 5 + Vite + TypeScript）で作業するときのメモ。
機能とサービス連携の全体像は `README.md`、未着手の検討事項は `TODO.md` を参照。

## コマンド

変更後は以下を通す（CI は `.github/workflows/ci.yml`）。

```bash
npm run lint    # biome
npm run check   # svelte-check + tsc
npm run test    # vitest
npm run build
```

## コードの書き方

- Svelte 5 のルーン（`$state` / `$derived` / `$effect`）。共有状態は `src/lib/*.svelte.ts` の
  クラス + シングルトン（`auth` / `cacheRelay` / `router` / `toast`）。
- コメントには「なぜ」を書く。コードを読めば分かる「何を」は書かない。
- コミットメッセージは日本語。

## リレーの扱い

ビューが Nostr 要素に渡すリレーは **`cacheRelay` から読む。`auth.relays` を直接渡さない。**

- `auth.relays` は `DEFAULT_RELAYS` で始まり、起動から数秒後に NIP-07 の read リレーへ
  差し替わる。
- nostr-cache のウィジェット（`nostr-timeline` / `nostr-follow-timeline` / `nostr-post`）は
  `relays` 属性の変化で再購読する。差し替えをそのまま渡すと表示中の投稿が消える。さらに
  アプリの acquisition がまだ無い時間帯だと参照数が 0 に落ち、ページ内リレー本体
  （IndexedDB・上流接続）まで停止・再起動する。
- 渡すもの:
  - nostr-cache のウィジェット → `cacheRelay.upstreamRelays`（自分でリレーを掴むので上流を渡す）
  - Nostr Web Components（`nostr-profile`）→ `cacheRelay.viewRelays`（横取り URL へ向ける）。
    これは `relays` の変化を見ないので `{#key}` で作り直す。
- どちらも `cacheRelay.resolved` を待ってからマウントする。アプリの acquisition が必ず
  ページ最初の取得になり、`db-name` / `profile-freshness` の設定もアプリ側が勝つ。
- ブラウザ内リレーは起動時の上流リレーを変えられない。リレー集合が変わったとき
  （ログイン・ログアウト・アカウント切替）だけ `App.svelte` が stop → start で作り直す。
- `db-name` / `profile-freshness` は全ウィジェットと `App.svelte` の acquisition で揃える
  （最初の取得が設定を決め、不一致は警告のみで無視される）。

## ビューのマウント

ホームと投稿作成（`ComposeView`）はタブを離れてもアンマウントしない（`class:hidden` で
隠す）。作り直すと購読・読み込み済みイベント・スクロール位置・下書きが失われ、
リロードに見えるため。ホームの 2 つのフィードも同じ理由で開いたら維持する。
