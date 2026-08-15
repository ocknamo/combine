import type { Action } from 'svelte/action';
import { POST_ACTION_EVENT, postActionPath } from './postRef';
import { router } from './router.svelte';

/**
 * Turn a tap on a timeline's 詳細 button into navigation to the detail page.
 *
 * The element's action event bubbles and is composed, so one listener on a
 * wrapper covers every nostr-cache element inside it — which is why `HomeView`
 * can carry both its feeds with a single `use:`. Two of these in one subtree
 * would navigate twice for one tap, so apply it at exactly one level.
 */
export const openPostOnAction: Action<HTMLElement> = (node) => {
  const onAction = (event: Event) => {
    const path = postActionPath((event as CustomEvent).detail);
    if (path) router.go(path);
  };
  node.addEventListener(POST_ACTION_EVENT, onAction);
  return {
    destroy() {
      node.removeEventListener(POST_ACTION_EVENT, onAction);
    },
  };
};
