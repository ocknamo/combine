<script lang="ts">
/**
 * `<nostr-profile>` with the two things every use of it in the app has to get
 * right.
 *
 * It is a Nostr Web Components element rather than a nostr-cache one, so it
 * takes `relays` as an array — the intercept URL when there is one, see
 * `pickViewRelays` — and it adopts neither a changed `relays` nor a changed
 * `user`. Hence the {#key}: whichever moves, the element is rebuilt for it
 * instead of going on showing what it was built with.
 *
 * The name it renders lives in a shadow root that exposes no `slot` / `::part`,
 * so `truncateName` reaches in and clamps it there.
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

<!-- Waits for the relay for the same reason the widgets do (`WidgetGate`), but
     shows nothing meanwhile: this element sits inside a view that is already
     saying it is loading, or in the header, where a placeholder would only
     flash. -->
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
