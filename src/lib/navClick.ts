/**
 * The click handlers the two navigation bars share.
 *
 * `TabBar` and `SideMenu` render the same five destinations as plain anchors;
 * these are the two that have to do more than follow the href.
 */

import { flushSync } from 'svelte';
import { focusCompose } from './composeFocus';
import { type RouteName, router } from './router.svelte';

/**
 * Clicking ホーム while the timeline is already on screen scrolls back to the
 * top instead of doing nothing.
 *
 * The bars navigate with plain anchors, and assigning the hash the page is
 * already on pushes no entry and fires no `hashchange` — so without this a
 * click on the destination the user is standing on is simply swallowed. Going
 * back to the top of the timeline is what the button reads as after scrolling a
 * long way down.
 */
function onHomeClick(event: MouseEvent): void {
  if (router.current.name !== 'home') return;
  event.preventDefault();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Clicking 投稿 opens the editor with the caret already in it, so the mobile
 * keyboard comes up on that same tap instead of a second one.
 *
 * Every step is inside the click handler on purpose. iOS Safari raises the
 * keyboard only for a `focus()` made while a user gesture is still running,
 * and letting the anchor navigate would put the move a `hashchange` — a whole
 * task — away. So the route moves here, `flushSync` gets the view on screen
 * (until then it is `display: none`, and nothing inside it can take focus),
 * and the focus follows in the same breath.
 *
 * A modified click is left to the browser: on a desktop that is "open in a new
 * tab", and there is no keyboard to raise there anyway.
 */
function onComposeClick(event: MouseEvent): void {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  router.go('/compose');
  flushSync();
  focusCompose();
}

/** Keyed by route name, so a bar can hand each anchor `navClick[tab.name]`. */
export const navClick: Partial<Record<RouteName, (event: MouseEvent) => void>> = {
  home: onHomeClick,
  compose: onComposeClick,
};
