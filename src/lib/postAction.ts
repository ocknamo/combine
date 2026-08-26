import type { Action } from 'svelte/action';
import { composeContext } from './composeContext.svelte';
import { toNevent, toNote } from './nip19';
import {
  actionPath,
  actionTarget,
  POST_ACTION_EVENT,
  POST_LIKE_ACTION,
  POST_REPLY_ACTION,
  POST_REPOST_ACTION,
  POST_SHARE_ACTION,
  type PostTarget,
  postPath,
} from './postRef';
import { react } from './reaction';
import { repost } from './repost';
import { router } from './router.svelte';
import { appUrl, shareLink } from './share';
import { toast } from './toast.svelte';

/** Open the editor with this post as the reply target. */
function reply(target: PostTarget): void {
  // nevent over note because it carries the author, which eHagaki needs for the
  // `p` tag. Falls back to the id as it came when there is nothing to encode.
  const ref = toNevent(target.id, { author: target.pubkey }) ?? target.id;
  composeContext.request({ reply: ref, quotes: [] });
  router.go('/compose');
}

/** Share the post's page in this app — the same link 詳細 opens. */
async function share(target: PostTarget): Promise<void> {
  const ref = toNote(target.id) ?? target.id;
  await shareLink(appUrl(postPath(ref)));
}

/**
 * The buttons that act on the post instead of navigating away from it, by the
 * id they report themselves as. Keyed rather than branched so the ids appear
 * once: a press whose id is not here is either handled by `actionPath` above or
 * is not ours at all.
 */
const ACTS_ON_POST = new Map<string, (target: PostTarget) => void>([
  [POST_REPLY_ACTION.id, reply],
  [POST_REPOST_ACTION.id, (target) => void repost(target)],
  [POST_LIKE_ACTION.id, (target) => void react(target)],
  [POST_SHARE_ACTION.id, (target) => void share(target)],
]);

/**
 * Turn a tap on a card into what it asks for: the 詳細 button opens the post,
 * the author's avatar or display name opens the person, and the buttons beside
 * 詳細 reply to it, repost it, react to it or share it.
 *
 * The element's action event bubbles and is composed, so one listener on a
 * wrapper covers every nostr-cache element inside it — which is why `HomeView`
 * can carry both its feeds with a single `use:`. Two of these in one subtree
 * would act twice on one tap, so apply it at exactly one level.
 */
export const handlePostAction: Action<HTMLElement> = (node) => {
  const onAction = (event: Event) => {
    const detail = (event as CustomEvent).detail;

    // Answers for the ids that lead somewhere else, null for `ACTS_ON_POST`.
    const path = actionPath(detail);
    if (path) {
      router.go(path);
      return;
    }

    const actionId = (detail as { actionId?: unknown } | null)?.actionId;
    const act = typeof actionId === 'string' ? ACTS_ON_POST.get(actionId) : undefined;
    if (!act) return;

    const target = actionTarget(detail);
    if (!target) {
      // Silence would read as a dead button.
      toast.show('この投稿に対しては実行できませんでした', 'error');
      return;
    }

    act(target);
  };

  node.addEventListener(POST_ACTION_EVENT, onAction);
  return {
    destroy() {
      node.removeEventListener(POST_ACTION_EVENT, onAction);
    },
  };
};
