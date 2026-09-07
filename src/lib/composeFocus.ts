/**
 * The navigation bars' way of asking the post editor for the caret.
 *
 * The ask has to be answered *now* — inside the click handler, while the click
 * still counts as a user gesture (see `navClick.ts` for why). A module-scope
 * hook is smaller than threading a callback from `App.svelte` down to both
 * `ComposeView` and whichever bar is on screen, and it keeps the DOM reach-in
 * on the side that owns the element.
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
 * `false` while the editor is still being built — the first click on 投稿 is
 * the one that starts that, so it always loses this race.
 */
export function focusCompose(): boolean {
  return handler?.() ?? false;
}
