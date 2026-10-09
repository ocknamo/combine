/**
 * Bumped when this app publishes the user's profile, for the views that show
 * it: `<nostr-profile>` reads once when built, so the card has to be rebuilt to
 * pick up the new kind 0 the cache relay now holds.
 *
 * Never reset: `{#key}` compares against its last value, and winding it back
 * would rebuild cards for nothing.
 */
class ProfileRevision {
  value = $state(0);

  bump(): void {
    this.value += 1;
  }
}

export const profileRevision = new ProfileRevision();
