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
