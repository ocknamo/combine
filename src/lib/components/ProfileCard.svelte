<script lang="ts">
/**
 * `<nostr-profile>`, which adopts neither a changed `relays` nor a changed
 * `user` — hence the {#key}, or it would go on showing what it was built with.
 *
 * A Nostr Web Components element, not a nostr-cache one: `relays` is an array
 * (`pickViewRelays`), and the name it renders is behind a shadow root with no
 * `::part`, which is what `truncateName` works around.
 */
import { cacheRelay } from '../cacheRelay.svelte';
import { truncateName } from '../truncateName';

let {
  user,
  display,
  /** Leave the card inert: combine has its own way to the person's page. */
  nolink = false,
  theme = undefined,
}: {
  /** hex, npub, nprofile or a NIP-05 address — whatever the element takes. */
  user: string;
  display: 'card' | 'name';
  nolink?: boolean;
  theme?: string;
} = $props();

const key = $derived(`${user}|${cacheRelay.viewRelays.join(',')}`);
</script>

<!-- No placeholder while it waits: the view around it already says it is
     loading, and in the header one would only flash. -->
{#if cacheRelay.resolved}
  {#key key}
    <nostr-profile
      use:truncateName={display}
      {user}
      relays={cacheRelay.viewRelays}
      {display}
      nolink={nolink ? 'true' : undefined}
      {theme}
    ></nostr-profile>
  {/key}
{/if}
