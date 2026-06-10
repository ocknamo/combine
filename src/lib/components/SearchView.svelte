<script lang="ts">
import { toHexPubkey } from '../nip19';
import { DEFAULT_RELAYS } from '../relays';

type Result =
  | { kind: 'user'; user: string; hex: string | null }
  | { kind: 'note'; id: string }
  | { kind: 'tag'; tag: string };

let query = $state('');
let result = $state<Result | null>(null);

function search(event: SubmitEvent) {
  event.preventDefault();
  const value = query.trim();
  if (!value) {
    result = null;
    return;
  }
  if (/^(npub1|nprofile1)/i.test(value)) {
    result = { kind: 'user', user: value, hex: toHexPubkey(value) };
  } else if (/^(note1|nevent1)/i.test(value)) {
    result = { kind: 'note', id: value };
  } else if (/^[0-9a-f]{64}$/i.test(value)) {
    result = { kind: 'user', user: value.toLowerCase(), hex: value.toLowerCase() };
  } else if (value.includes('@') || /^[\w.-]+\.[a-z]{2,}$/i.test(value)) {
    // NIP-05 address
    result = { kind: 'user', user: value, hex: null };
  } else {
    result = { kind: 'tag', tag: value.replace(/^#/, '').toLowerCase() };
  }
}
</script>

<section>
  <form onsubmit={search}>
    <input
      type="search"
      bind:value={query}
      placeholder="ハッシュタグ、npub、note1、NIP-05 で検索"
      aria-label="検索"
    />
    <button type="submit" class="primary">検索</button>
  </form>

  {#if result}
    {#key query}
      {#if result.kind === 'tag'}
        <h2>#{result.tag}</h2>
        <nostr-list
          filters={JSON.stringify([{ kinds: [1], '#t': [result.tag], limit: 30 }])}
          relays={DEFAULT_RELAYS}
          theme="light"
        ></nostr-list>
      {:else if result.kind === 'note'}
        <nostr-note nevent={result.id} relays={DEFAULT_RELAYS} theme="light"></nostr-note>
      {:else}
        <nostr-profile user={result.user} relays={DEFAULT_RELAYS} display="card"></nostr-profile>
        {#if result.hex}
          <h2>投稿</h2>
          <nostr-list
            filters={JSON.stringify([{ kinds: [1], authors: [result.hex], limit: 30 }])}
            relays={DEFAULT_RELAYS}
            theme="light"
          ></nostr-list>
        {/if}
      {/if}
    {/key}
  {:else}
    <p class="empty">キーワード（ハッシュタグ扱い）か、npub / nprofile / note1 / nevent1 / NIP-05 アドレスを入力してください。</p>
  {/if}
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  form {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 3.1rem;
    background: var(--bg);
  }

  h2 {
    font-size: 1rem;
    margin: 0.5rem 1rem 0;
    color: var(--gold-strong);
  }

  .empty {
    text-align: center;
    color: var(--text-muted);
    padding: 2rem 1rem;
  }
</style>
