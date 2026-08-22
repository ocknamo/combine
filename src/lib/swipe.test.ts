import { describe, expect, it } from 'vitest';
import { SWIPE_MIN_DISTANCE, swipeDirection } from './swipe';

describe('swipeDirection', () => {
  it('reads a wide flick by the way the finger moved', () => {
    expect(swipeDirection(-SWIPE_MIN_DISTANCE, 0)).toBe('left');
    expect(swipeDirection(SWIPE_MIN_DISTANCE, 0)).toBe('right');
  });

  it('ignores travel shorter than the threshold', () => {
    expect(swipeDirection(SWIPE_MIN_DISTANCE - 1, 0)).toBeNull();
    expect(swipeDirection(-(SWIPE_MIN_DISTANCE - 1), 0)).toBeNull();
  });

  it('ignores a scroll that drifted sideways', () => {
    expect(swipeDirection(120, 300)).toBeNull();
    expect(swipeDirection(-120, -300)).toBeNull();
  });

  it('allows a swipe that is not quite level', () => {
    expect(swipeDirection(200, 40)).toBe('right');
    expect(swipeDirection(200, -40)).toBe('right');
  });

  it('ignores a tap', () => {
    expect(swipeDirection(0, 0)).toBeNull();
  });
});
