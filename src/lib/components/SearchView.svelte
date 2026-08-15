<script lang="ts">
import { cacheRelay } from '../cacheRelay.svelte';
import { toHexPubkey } from '../nip19';
import { normalizePostRef, postPath } from '../postRef';
import { router } from '../router.svelte';
import { truncateName } from '../truncateName';
import TimelineEmbed from './TimelineEmbed.svelte';

type Result = { kind: 'user'; user: string; hex: string | null } | { kind: 'tag'; tag: string };

let query = $state('');
let result = $state<Result | null>(null);

// `nostr-profile` ignores a changed `relays`, so the {#key} below rebuilds it
// when the connection target moves. Its other half is `result`, not the bound
// `query`: typing the next search must not rebuild the result on screen.
const relayKey = $derived(cacheRelay.viewRelays.join(','));

function search(event: SubmitEvent) {
  event.preventDefault();
  const value = query.trim();
  if (!value) {
    result = null;
    return;
  }
  // A post reference is a place, not a result: it gets its own page so it can
  // be linked to and come back from. Bare hex is left to the pubkey branch
  // below, which is what it has always meant here. Something that only looks
  // like a reference falls through to the searches.
  if (/^(note1|nevent1|naddr1)/i.test(value)) {
    const ref = normalizePostRef(value);
    if (ref) {
      router.go(postPath(ref));
      return;
    }
  }
  if (/^(npub1|nprofile1)/i.test(value)) {
    result = { kind: 'user', user: value, hex: toHexPubkey(value) };
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
    {#if result.kind === 'tag'}
      <h2>#{result.tag}</h2>
      <TimelineEmbed filters={[{ kinds: [1], '#t': [result.tag], limit: 30 }]} />
    {:else}
      {#if cacheRelay.resolved}
        {#key `${result.user}|${relayKey}`}
          <nostr-profile use:truncateName={'card'} user={result.user} relays={cacheRelay.viewRelays} display="card"></nostr-profile>
        {/key}
      {/if}
      {#if result.hex}
        <h2>投稿</h2>
        <TimelineEmbed filters={[{ kinds: [1], authors: [result.hex], limit: 30 }]} />
      {/if}
    {/if}
  {:else}
    <p class="empty">キーワード（ハッシュタグ扱い）か、npub / nprofile / note1 / nevent1 / naddr1 / NIP-05 アドレスを入力してください。</p>
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
