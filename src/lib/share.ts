/**
 * Handing a link to the OS share sheet, or to the clipboard where there is
 * none. Shared by a person's page and the 共有 button under every post.
 */
import { toast } from './toast.svelte';

/**
 * A share the user dismissed must not fall back to the clipboard — copying
 * something they just declined to send is the one outcome they did not ask for.
 */
export async function shareLink(url: string): Promise<void> {
  if (navigator.share) {
    try {
      await navigator.share({ url });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
  }
  await navigator.clipboard.writeText(url);
  toast.show('リンクをコピーしました');
}

/** The absolute URL of a hash path in this app, for handing to someone else. */
export function appUrl(path: string): string {
  return `${location.origin}${location.pathname}#${path}`;
}
