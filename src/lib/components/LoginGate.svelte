<script lang="ts">
import { auth } from '../auth.svelte';

let { message = 'この機能を使うにはログインが必要です。' }: { message?: string } = $props();

const logoUrl = `${import.meta.env.BASE_URL}logo.png`;
</script>

<div class="gate">
  <img src={logoUrl} alt="combine" width="160" />
  <p>{message}</p>
  <button class="primary" onclick={() => auth.login()} disabled={auth.busy}>
    {auth.busy ? '接続中…' : 'パスキーでログイン'}
  </button>
  {#if auth.error}
    <p class="error" role="alert">{auth.error}</p>
  {/if}
  {#if auth.needsOnboarding}
    <p>
      はじめての方は
      <a href="https://nosskey.app" target="_blank" rel="noreferrer">nosskey.app</a>
      でパスキーを作成してから戻ってきてください。
    </p>
  {/if}
  <p class="hint">
    ログインには <a href="https://nosskey.app" target="_blank" rel="noreferrer">Nosskey</a>
    のパスキー署名を使用します。秘密鍵がこのアプリに渡ることはありません。
  </p>
</div>

<style>
  .gate {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    text-align: center;
    padding: 3rem 1.5rem;
  }

  .gate img {
    margin-bottom: 0.5rem;
  }

  .gate p {
    margin: 0;
    max-width: 32rem;
  }

  .error {
    color: var(--danger);
  }

  .hint {
    font-size: 0.8rem;
    color: var(--text-muted);
  }
</style>
