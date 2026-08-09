import { beforeEach, describe, expect, it } from 'vitest';
import { readScroll, resetScrollMemory, saveScroll, scrollKey } from './scrollMemory';

describe('scrollKey', () => {
  it('is the route name for a plain route', () => {
    expect(scrollKey('home')).toBe('home');
    expect(scrollKey('notifications')).toBe('notifications');
  });

  it('separates the targets of a parameterised route', () => {
    expect(scrollKey('user', 'npub1a')).not.toBe(scrollKey('user', 'npub1b'));
  });

  it('ignores an empty param', () => {
    expect(scrollKey('user', '')).toBe('user');
  });
});

describe('scroll memory', () => {
  beforeEach(() => {
    resetScrollMemory();
  });

  it('reads back what was saved', () => {
    saveScroll('home', 420);
    expect(readScroll('home')).toBe(420);
  });

  it('keeps views apart', () => {
    saveScroll('home', 420);
    saveScroll('search', 10);
    expect(readScroll('home')).toBe(420);
    expect(readScroll('search')).toBe(10);
  });

  it('starts an unvisited view at the top', () => {
    expect(readScroll('profile')).toBe(0);
  });

  it('overwrites an earlier offset', () => {
    saveScroll('home', 420);
    saveScroll('home', 0);
    expect(readScroll('home')).toBe(0);
  });
});
