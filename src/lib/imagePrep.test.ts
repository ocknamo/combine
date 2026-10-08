import { describe, expect, it } from 'vitest';
import { fitWithin, keepsOriginal, outputTypes, renameFor } from './imagePrep';

describe('fitWithin', () => {
  it('shrinks the long edge to the cap, keeping the ratio', () => {
    expect(fitWithin(4000, 3000, 1024)).toEqual({ width: 1024, height: 768 });
    expect(fitWithin(3000, 4000, 1024)).toEqual({ width: 768, height: 1024 });
  });

  it('never enlarges', () => {
    expect(fitWithin(400, 300, 1024)).toEqual({ width: 400, height: 300 });
  });

  it('keeps at least one pixel on an extreme strip', () => {
    expect(fitWithin(10000, 2, 1000)).toEqual({ width: 1000, height: 1 });
  });
});

describe('outputTypes', () => {
  it('tries WebP first, then a fallback that keeps transparency where it may exist', () => {
    expect(outputTypes('image/png')).toEqual(['image/webp', 'image/png']);
    expect(outputTypes('image/webp')).toEqual(['image/webp', 'image/png']);
    expect(outputTypes('image/jpeg')).toEqual(['image/webp', 'image/jpeg']);
    expect(outputTypes('image/heic')).toEqual(['image/webp', 'image/jpeg']);
  });
});

describe('keepsOriginal', () => {
  it('passes GIF through so an animation survives', () => {
    expect(keepsOriginal('image/gif')).toBe(true);
    expect(keepsOriginal('image/jpeg')).toBe(false);
  });
});

describe('renameFor', () => {
  it('matches the extension to the new type', () => {
    expect(renameFor('IMG_0001.HEIC', 'image/jpeg')).toBe('IMG_0001.jpg');
    expect(renameFor('photo.png', 'image/webp')).toBe('photo.webp');
    expect(renameFor('noext', 'image/png')).toBe('noext.png');
    expect(renameFor('.jpg', 'image/webp')).toBe('image.webp');
  });
});
