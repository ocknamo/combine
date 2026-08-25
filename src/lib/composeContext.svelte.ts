import type { ComposerContext } from './ehagakiComposer';

/**
 * What the editor should open with, left here by whoever navigated to the
 * compose tab.
 *
 * The route carries nothing (`parseRoute` takes no parameter for `compose`),
 * and the element the context belongs to may not exist yet — it is built the
 * first time the user opens that tab, which is often this navigation itself. So
 * the ask is parked here and `ComposeView` collects it when it can (it has its
 * own buffer for the window between "created" and "ready").
 *
 * Taken rather than read: a reply target applies to the one visit it was
 * requested for. Leaving it set would put the same reply back into the editor
 * the next time the user opened the tab to write something of their own.
 */
class ComposeContextStore {
  pending = $state<ComposerContext | null>(null);

  /** Ask the editor to open with this context. Replaces an unclaimed one. */
  request(context: ComposerContext): void {
    this.pending = context;
  }

  /** Claim the pending context, if any. */
  take(): ComposerContext | null {
    const context = this.pending;
    this.pending = null;
    return context;
  }
}

export const composeContext = new ComposeContextStore();
