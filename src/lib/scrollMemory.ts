/**
 * Where each view was scrolled to when the user last left it.
 *
 * Views that survive a tab switch (see `App.svelte`) are hidden with
 * `display: none` rather than unmounted, so they keep their state — but they
 * also stop contributing height to the page, which is the document's scroll
 * container. The browser clamps the scroll offset the moment that happens, so
 * the position has to be recorded while the view is still on screen and put
 * back after the next one has rendered.
 *
 * A plain module-level map: this is per-session, throwaway state, and nothing
 * renders from it, so there is no reason to make it reactive.
 */
const offsets = new Map<string, number>();

/**
 * Key a route is remembered under. Parameterised routes get one entry per
 * target — two different profiles are two different views, and coming back to
 * one should not land at the other's offset.
 */
export function scrollKey(name: string, param?: string): string {
  return param ? `${name}/${param}` : name;
}

/** Record where a view is scrolled to. */
export function saveScroll(key: string, offset: number): void {
  offsets.set(key, offset);
}

/**
 * Where a view was left, or the top for one that has not been visited (or was
 * unmounted while away, which resets it to the top anyway).
 */
export function readScroll(key: string): number {
  return offsets.get(key) ?? 0;
}

/** Forget every recorded offset. Exists for tests. */
export function resetScrollMemory(): void {
  offsets.clear();
}
