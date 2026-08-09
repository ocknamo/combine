# combine

シンプルな Nostr クライアント。複数の Nostr サービスを「組み合わせて」作られています。

![combine](public/logo.png)

## 構成サービス

| 機能 | サービス | 連携方法 |
| --- | --- | --- |
| 署名（パスキー） | [Nosskey](https://nosskey.app) | [nosskey-iframe](https://github.com/ocknamo/nosskey-sdk) による iframe 埋め込み |
| 投稿エディタ | [eHagaki](https://lokuyow.github.io/ehagaki/) | iframe 埋め込み + `ehagaki.embed` postMessage 連携 |
| ホームタイムライン | [nostr-cache](https://github.com/ocknamo/nostr-cache) | ホスト済み Web Components (`nostr-timeline` / `nostr-follow-timeline`) |
| イベント取得のキャッシュ | [nostr-cache](https://github.com/ocknamo/nostr-cache) | ブラウザ内リレーを全ビューの手前に透過キャッシュとして挟む |
| その他のイベント表示 | [Nostr Web Components](https://github.com/TsukemonoGit/nostr-web-components) | Web Components (`nostr-list` / `nostr-profile` / `nostr-note`) |

秘密鍵はこのアプリに渡りません。eHagaki からの署名要求（`rpc.request`）は親クライアントが受け取り、Nosskey のパスキー署名へ委譲します。

## 機能

- パスキーログイン（Nosskey iframe / NIP-07 互換）
- ホームタイムライン（フォロー中 / グローバル切り替え）
  - 「フォロー中」は `nostr-follow-timeline` が kind 3 の取得とキャッシュまで担当する
- 全ビューの透過キャッシュ
  - nostr-cache がブラウザ内リレーを上流リレーの手前に挟むため、2 回目以降の表示は
    IndexedDB のキャッシュから即座に描画される
  - タイムラインだけでなく、通知・プロフィール・検索も同じキャッシュを通る。
    ブラウザ内リレーは `globalThis.WebSocket` を差し替えて 1 つの URL への接続だけを
    横取りする仕組みなので、Nostr Web Components の接続先をその URL に向けるだけで
    キャッシュに載る（どちらも内部は rx-nostr）
  - プロフィール（kind 0）は 1 時間の鮮度ウィンドウが効き、Header とプロフィール画面が
    同じ pubkey を取り直さなくなる
  - nostr-cache に到達できない環境では自動的に上流リレー直結へフォールバックする
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
