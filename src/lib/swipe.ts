import type { Action } from 'svelte/action';

/** Direction of a horizontal swipe, named after the way the finger moved. */
export type SwipeDirection = 'left' | 'right';

/**
 * How far the finger has to travel before a gesture counts as a swipe.
 *
 * Deliberately long: the only thing a swipe does here is switch feed, and doing
 * that by accident throws the reader out of the list they were reading. A
 * flick this wide is hard to produce while scrolling or while reaching for a
 * link, and still comfortable as a one-thumb gesture on a phone.
 */
export const SWIPE_MIN_DISTANCE = 96;

/**
 * How much straighter than vertical the travel has to be.
 *
 * The page scrolls vertically, so anything with a real vertical component is
 * far more likely to be a scroll that drifted sideways than a swipe.
 */
export const SWIPE_MAX_SLOPE = 0.5;

/**
 * The direction a finger travelling `dx`/`dy` swiped in, or `null` when the
 * travel is too short or too steep to read as one.
 */
export function swipeDirection(dx: number, dy: number): SwipeDirection | null {
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return null;
  if (Math.abs(dy) > Math.abs(dx) * SWIPE_MAX_SLOPE) return null;
  return dx < 0 ? 'left' : 'right';
}

/**
 * Report wide horizontal swipes over an element.
 *
 * Touch only: a mouse drag across a page is a text selection, and a trackpad
 * swipe is the browser's own back gesture. Nothing here calls
 * `preventDefault()` either — the gesture is recognised after the fact, so the
 * page keeps scrolling and links keep working exactly as they did, and a
 * gesture that turns out not to be a swipe has cost the user nothing.
 *
 * Only the total travel decides, which is why the move handler exists at all:
 * a finger that wanders down the page and comes back would otherwise land
 * within the slope allowance. The largest vertical excursion is kept instead.
 */
export const swipeHorizontal: Action<HTMLElement, (direction: SwipeDirection) => void> = (
  node,
  onSwipe
) => {
  let handler = onSwipe;
  let startX = 0;
  let startY = 0;
  let maxDy = 0;
  let tracking = false;

  const onStart = (event: TouchEvent) => {
    // A second finger means a pinch or a two-finger scroll, never a swipe.
    tracking = event.touches.length === 1;
    if (!tracking) return;
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
    maxDy = 0;
  };

  const onMove = (event: TouchEvent) => {
    if (!tracking) return;
    if (event.touches.length !== 1) {
      tracking = false;
      return;
    }
    maxDy = Math.max(maxDy, Math.abs(event.touches[0].clientY - startY));
  };

  const onEnd = (event: TouchEvent) => {
    if (!tracking) return;
    tracking = false;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const dy = Math.max(maxDy, Math.abs(touch.clientY - startY));
    const direction = swipeDirection(touch.clientX - startX, dy);
    if (direction) handler(direction);
  };

  const onCancel = () => {
    tracking = false;
  };

  node.addEventListener('touchstart', onStart, { passive: true });
  node.addEventListener('touchmove', onMove, { passive: true });
  node.addEventListener('touchend', onEnd, { passive: true });
  node.addEventListener('touchcancel', onCancel, { passive: true });

  return {
    update(next) {
      handler = next;
    },
    destroy() {
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchmove', onMove);
      node.removeEventListener('touchend', onEnd);
      node.removeEventListener('touchcancel', onCancel);
    },
  };
};
