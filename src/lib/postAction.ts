import type { Action } from 'svelte/action';
import { composeContext } from './composeContext.svelte';
import { toNevent, toNote } from './nip19';
import {
  actionPath,
  actionTarget,
  POST_ACTION_EVENT,
  POST_REPLY_ACTION,
  POST_REPOST_ACTION,
  POST_SHARE_ACTION,
  type PostTarget,
  postPath,
} from './postRef';
import { repost } from './repost';
import { router } from './router.svelte';
import { appUrl, shareLink } from './share';
import { toast } from './toast.svelte';

/** Open the editor with this post as the reply target. */
function reply(target: PostTarget): void {
  // nevent rather than note: it carries the author, so eHagaki can tag them
  // without fetching the post first. `toNevent` falls back to note when the
  // card gave us no author, and to null when the id is not hex — a card whose
  // id is a bech32 reference (nothing in the app's own lists produces one)
  // still reaches the editor as itself.
  const ref = toNevent(target.id, { author: target.pubkey }) ?? target.id;
  composeContext.request({ reply: ref, quotes: [] });
  router.go('/compose');
}

/** Share the post's page in this app — the same link the 詳細 button opens. */
async function share(target: PostTarget): Promise<void> {
  const ref = toNote(target.id) ?? target.id;
  await shareLink(appUrl(postPath(ref)));
}

/**
 * Turn a tap on a card into what it asks for: the 詳細 button opens the post,
 * the author's avatar or display name opens the person, and the three buttons
 * beside 詳細 reply to it, repost it or share it.
 *
 * The element's action event bubbles and is composed, so one listener on a
 * wrapper covers every nostr-cache element inside it — which is why `HomeView`
 * can carry both its feeds with a single `use:`. Two of these in one subtree
 * would act twice on one tap, so apply it at exactly one level.
 */
export const handlePostAction: Action<HTMLElement> = (node) => {
  const onAction = (event: Event) => {
    const detail = (event as CustomEvent).detail;

    // Navigation first: it answers for the ids that lead somewhere else, and
    // returns null for everything below.
    const path = actionPath(detail);
    if (path) {
      router.go(path);
      return;
    }

    const actionId = (detail as { actionId?: unknown } | null)?.actionId;
    if (
      actionId !== POST_REPLY_ACTION.id &&
      actionId !== POST_REPOST_ACTION.id &&
      actionId !== POST_SHARE_ACTION.id
    ) {
      return;
    }

    const target = actionTarget(detail);
    if (!target) {
      // The card did not say which post it was — nothing to act on, and
      // silence would read as a dead button.
      toast.show('この投稿に対しては実行できませんでした', 'error');
      return;
    }

    if (actionId === POST_REPLY_ACTION.id) reply(target);
    else if (actionId === POST_REPOST_ACTION.id) void repost(target);
    else void share(target);
  };

  node.addEventListener(POST_ACTION_EVENT, onAction);
  return {
    destroy() {
      node.removeEventListener(POST_ACTION_EVENT, onAction);
    },
  };
};
