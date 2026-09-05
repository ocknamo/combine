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
  **端的に。** 1 つの理由は 1〜2 行で書き切る。同じことを言い換えない、
  背景を段落で語らない、シグネチャや型が示していることを繰り返さない。
  複数の理由が要るときだけ行を足す。
- コミットメッセージは日本語。

## 設定と環境変数

- `VITE_*` はビルド時にバンドルへ平文で埋め込まれる＝**公開情報**。鍵の類は入れない。
  いまは次の 2 つで、どちらも Pages のビルドには `.github/workflows/deploy.yml` の
  リポジトリ変数から渡る。
  - `VITE_OGP_PROXY`（リンクカード用の CORS プロキシ。未設定ならカードを出さない）
  - `VITE_IMAGE_PROXY`（画像最適化プロキシ。未設定なら画像を直接読み込む。
    URL はコードに書かず、CD のリポジトリ変数から渡す）
