import { describe, expect, it } from 'vitest';
import { parseRoute } from './routes';

const HEX = '5c04292b7f0c6a1c1b7c9a5e4d3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f';
const NOTE = 'note1tszzj2c3aq0h9qn30k3rlxr7d2u4agr7wcm3zwvpu2qzk6yjjxpqvfjc6l';

describe('parseRoute', () => {
  it('reads the fixed routes', () => {
    expect(parseRoute('#/search')).toEqual({ name: 'search' });
    expect(parseRoute('#/compose')).toEqual({ name: 'compose' });
    expect(parseRoute('#/notifications')).toEqual({ name: 'notifications' });
    expect(parseRoute('#/profile')).toEqual({ name: 'profile' });
  });

  it('falls back to home for an empty or unknown hash', () => {
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('#/')).toEqual({ name: 'home' });
    expect(parseRoute('#/nowhere')).toEqual({ name: 'home' });
  });

  it('reads the post route', () => {
    expect(parseRoute(`#/post/${HEX}`)).toEqual({ name: 'post', param: HEX });
    expect(parseRoute(`#/post/${NOTE}`)).toEqual({ name: 'post', param: NOTE });
    expect(parseRoute('#/post/nevent1abc')).toEqual({ name: 'post', param: 'nevent1abc' });
    expect(parseRoute('#/post/naddr1abc')).toEqual({ name: 'post', param: 'naddr1abc' });
  });

  it('sends a parameterised route with no parameter home', () => {
    expect(parseRoute('#/post')).toEqual({ name: 'home' });
    expect(parseRoute('#/post/')).toEqual({ name: 'home' });
    expect(parseRoute('#/user')).toEqual({ name: 'home' });
    expect(parseRoute('#/user/')).toEqual({ name: 'home' });
  });

  it('decodes a percent-encoded parameter', () => {
    expect(parseRoute('#/post/a%20b')).toEqual({ name: 'post', param: 'a b' });
    expect(parseRoute('#/user/a%20b')).toEqual({ name: 'user', param: 'a b' });
  });

  it('keeps only the first parameter segment', () => {
    expect(parseRoute('#/post/a/b')).toEqual({ name: 'post', param: 'a' });
  });

  it('reads the user route', () => {
    expect(parseRoute(`#/user/${HEX}`)).toEqual({ name: 'user', param: HEX });
  });
});
