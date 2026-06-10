# combine

シンプルな Nostr クライアント。複数の Nostr サービスを「組み合わせて」作られています。

![combine](public/logo.png)

## 構成サービス

| 機能 | サービス | 連携方法 |
| --- | --- | --- |
| 署名（パスキー） | [Nosskey](https://nosskey.app) | [nosskey-iframe](https://github.com/ocknamo/nosskey-sdk) による iframe 埋め込み |
| 投稿エディタ | [eHagaki](https://lokuyow.github.io/ehagaki/) | iframe 埋め込み + `ehagaki.embed` postMessage 連携 |
| タイムライン・イベント表示 | [Nostr Web Components](https://github.com/TsukemonoGit/nostr-web-components) | Web Components (`nostr-stream` / `nostr-list` / `nostr-profile` / `nostr-note`) |

秘密鍵はこのアプリに渡りません。eHagaki からの署名要求（`rpc.request`）は親クライアントが受け取り、Nosskey のパスキー署名へ委譲します。

## 機能

- パスキーログイン（Nosskey iframe / NIP-07 互換）
- ホームタイムライン（フォロー中 / グローバル切り替え。kind 3 をリレーから直接取得）
- 投稿・返信・引用（eHagaki 埋め込み）
- 通知（メンション・リポスト・リアクション・Zap）
- プロフィール表示・自分の投稿一覧・npub コピー
- 検索（ハッシュタグ / npub / nprofile / note1 / nevent1 / NIP-05）
- シングルカラム・モバイルファーストのレスポンシブデザイン

## 開発

```bash
npm install
npm run dev          # 開発サーバー
npm run build        # 本番ビルド
npm run check        # svelte-check + tsc
npm run lint         # biome
npm run format       # biome フォーマット
npm run test         # vitest
```

## ライセンス

MIT
