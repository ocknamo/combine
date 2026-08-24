/**
 * The tab bar's way of asking the post editor for the caret.
 *
 * `TabBar` and `ComposeView` are siblings under `App.svelte` with nothing
 * between them, and the ask has to be answered *now* — inside the click
 * handler, while the tap still counts as a user gesture (see `TabBar.svelte`
 * for why). A module-scope hook is smaller than threading a callback down two
 * component trees, and it keeps the DOM reach-in on the side that owns the
 * element.
 *
 * Deliberately not `$state`: nothing renders from this, and a caller that
 * waited for an effect to run would already be too late.
 */

type FocusHandler = () => boolean;

let handler: FocusHandler | null = null;

/** Registered by `ComposeView` while it is mounted; `null` clears it. */
export function setComposeFocusHandler(next: FocusHandler | null): void {
  handler = next;
}

/**
 * Ask for the caret, and report whether the editor actually took it.
 *
 * `false` while the editor is still being built — the first tap on the tab is
 * the one that starts that, so it always loses this race.
 */
export function focusCompose(): boolean {
  return handler?.() ?? false;
}
