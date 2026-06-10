# シンプルなsvleteアプリケーションのセットアップ手順

チェックに失敗した場合は通るまで繰り返し修正を行う

## 1. 準備

```
# .git がない場合
git init
git branch -m main

# Nodejs, npm を最新化する

volta install node@24
```

## 2.Viteによるセットアップ


```
# app-nameが不明な場合はユーザに確認する
npm create vite@latest app-name -- --template svelte-ts --no-interactive

cd app-name
npm install
```

### チェック

```
npm run build
npm run check
```


## 3.linter

biomeを使用する

```
# Install
npm install --save-dev --save-exact @biomejs/biome

# 設定
npx @biomejs/biome init
```

### 設定例

$schemaなどは生成されたテンプレートから変更しなくてよい。
他の設定値は修正して以下のように設定する。

**注意事項:**
- `organizeImports`は廃止されたため、`assist.actions.source.organizeImports`を使用する
- `files.include`と`files.ignore`は`files.includes`のみを使用する（`ignore`は削除）
- **重要:** `useImportExtensions`を`"off"`に設定することで、Biomeが自動的にインポートパスを`.js`拡張子に変更する問題を予防できる
  - Svelteプロジェクトでは`.svelte`, `.svg`, `.css`などの実際のファイル拡張子を使用する必要があるため、このルールは無効化する

**Svelte 5使用時の追加設定:**
- **重要:** Svelte 5の`$state()`, `$derived()`, `$effect()`などのrunesを使用する場合、以下のルールを無効化する必要がある：
  - `noUnusedImports`: Svelteテンプレート内で使用されているコンポーネントや関数を「未使用」と誤検知する
  - `noUnusedVariables`: `$state()`で宣言された変数がテンプレート内でのみ使用される場合に「未使用」と誤検知する
  - `useConst`: `$state()`は再代入可能な状態管理runeのため、`let`での宣言が必須。Biomeが`const`を提案すると型エラーが発生する
- これらのルールはSvelte固有の構文をBiomeが完全に理解できないために発生する問題

```json
{
  "$schema": "<url>",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "includes": ["./src/*", "./examples/*"]
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "complexity": {
        "useLiteralKeys": "off"
      },
      "correctness": {
        "useImportExtensions": "off",
        "noUnusedImports": "off",
        "noUnusedVariables": "off"
      },
      "style": {
        "useConst": "off"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "trailingCommas": "es5",
      "semicolons": "always"
    }
  },
  "assist": {
    "enabled": true,
    "actions": {
      "source": {
        "organizeImports": "on"
      }
    }
  }
}
```


以下のスクリプトをpackage.jsonに設定

```
    "format": "biome format --write && biome check --write",
    "format:check": "biome check ./src",
    "lint": "biome check",
    "lint:fix": "biome check --write",
```

以下を実行してフォーマットができることを確認してください

```
npm run format
```

### チェック

```
npm run build
npm run check
npm run format:check
npm run lint
```

## 4.Vitestの導入

```
npm install -D vitest
```

スクリプトの設定

```
    "test": "vitest run",
```


### チェック

```
npm run test
```

## 5. Tailwind CSS の導入（オプション）

Tailwind CSS v4を導入する場合、以下の設定が必要です。

### インストール

```bash
npm install -D tailwindcss @tailwindcss/vite @tailwindcss/forms
```

### vite.config.ts の設定

```typescript
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
});
```

### src/app.css の作成

```css
@import "tailwindcss";
@plugin "@tailwindcss/forms";
```

**重要:** `@import` は `@plugin` より前に記述する必要があります（CSS仕様の要件）。

### biome.json への CSS パーサー設定の追加

Tailwind CSS v4 の特殊な構文（`@plugin`, `@import "tailwindcss"`）を認識させるため、以下を追加：

```json
{
  "css": {
    "parser": {
      "cssModules": false,
      "allowWrongLineComments": true,
      "tailwindDirectives": true
    },
    "linter": {
      "enabled": true
    }
  }
}
```

### VS Code の設定

`.vscode/settings.json` を作成または更新して、VS Code の組み込み CSS 検証を無効化：

```json
{
  "css.lint.unknownAtRules": "ignore",
  "css.validate": false
}
```

これにより、VS Code が `@plugin` を未知のルールとして警告しなくなります。CSS の検証は Biome (`npm run lint`) で行います。

### チェック

```bash
npm run lint
npm run build
```

## 6. 最終調整


1. README.mdの内容を確認して実際の内容と合わせる。実際の内容が不明な場合は以下のような空のREADME.mdを作成

```README.md
# <app-name>

TBD
```

2. LICENSEファイルを ocknamo 名義でMITで作成する


## 最終フィードバック

- 手順内で発生した問題をこのファイル自体 @/docs/SVELTE.md にフィードバックして再発防止を行う
- 以前の陳腐化した内容があれば削除する
- ユーザに報告

