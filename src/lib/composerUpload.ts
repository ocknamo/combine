/**
 * Uploading a file through the post editor's eHagaki element from another view.
 *
 * The element is `ComposeView`'s — one per document, and taking it out of the
 * DOM tears down its mount and the draft with it — so the upload is asked of
 * that view rather than done here. A module-scope hook, like `composeFocus.ts`,
 * because the asking view (the profile editor) has no reference to it.
 */
import type { EHagakiUploadResult } from './ehagakiComposer';

type UploadHandler = (file: File, signal: AbortSignal) => Promise<EHagakiUploadResult>;

let handler: UploadHandler | null = null;

/** Registered by `ComposeView` while it is mounted; `null` clears it. */
export function setComposerUploadHandler(next: UploadHandler | null): void {
  handler = next;
}

/**
 * Upload `file` with the user's eHagaki settings. Builds the editor element if
 * it is not up yet. Rejects with the element's named errors (see
 * `uploadErrorMessage`).
 */
export function uploadViaComposer(file: File, signal: AbortSignal): Promise<EHagakiUploadResult> {
  if (!handler) {
    return Promise.reject(
      Object.assign(new Error('Compose view is not mounted.'), { name: 'not_ready' })
    );
  }
  return handler(file, signal);
}
