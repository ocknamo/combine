import type { ComposerContext } from './ehagakiComposer';

/**
 * What the editor should open with, left here by whoever navigated to the
 * compose tab.
 *
 * A store rather than a route parameter because `parseRoute` takes none for
 * `compose`, and because the editor may not exist yet — it is built the first
 * time the user opens that tab, which is often this navigation itself.
 *
 * Taken rather than read: leaving it set would put the same reply back into the
 * editor the next time the user opened the tab to write something of their own.
 */
class ComposeContextStore {
  pending = $state<ComposerContext | null>(null);

  /** Replaces an unclaimed one: the last press is the one the user meant. */
  request(context: ComposerContext): void {
    this.pending = context;
  }

  take(): ComposerContext | null {
    const context = this.pending;
    this.pending = null;
    return context;
  }
}

export const composeContext = new ComposeContextStore();
