import type { Action } from 'svelte/action';
import { actionPath, POST_ACTION_EVENT } from './postRef';
import { router } from './router.svelte';

/**
 * Turn a tap on a card into navigation: the 詳細 button opens the post, the
 * author's avatar or display name opens the person.
 *
 * The element's action event bubbles and is composed, so one listener on a
 * wrapper covers every nostr-cache element inside it — which is why `HomeView`
 * can carry both its feeds with a single `use:`. Two of these in one subtree
 * would navigate twice for one tap, so apply it at exactly one level.
 */
export const navigateOnAction: Action<HTMLElement> = (node) => {
  const onAction = (event: Event) => {
    const path = actionPath((event as CustomEvent).detail);
    if (path) router.go(path);
  };
  node.addEventListener(POST_ACTION_EVENT, onAction);
  return {
    destroy() {
      node.removeEventListener(POST_ACTION_EVENT, onAction);
    },
  };
};
