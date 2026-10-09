import { describe, expect, it } from 'vitest';
import {
  asProfileEvent,
  buildProfile,
  changedFields,
  type ProfileEvent,
  parseProfileContent,
  pickLatestProfile,
  profileForm,
  validateProfileField,
} from './profileMeta';

const ME = 'a'.repeat(64);

function profile(meta: unknown, overrides: Partial<ProfileEvent> = {}): ProfileEvent {
  return {
    kind: 0,
    pubkey: ME,
    created_at: 1000,
    content: typeof meta === 'string' ? meta : JSON.stringify(meta),
    tags: [],
    ...overrides,
  };
}

describe('asProfileEvent', () => {
  it('accepts this person’s kind 0', () => {
    expect(asProfileEvent({ ...profile({ name: 'a' }), id: 'x', sig: 'y' }, ME)).toEqual(
      profile({ name: 'a' })
    );
  });

  it('rejects another kind, another author or a malformed event', () => {
    expect(asProfileEvent({ ...profile({}), kind: 1 }, ME)).toBeNull();
    expect(asProfileEvent(profile({}), 'b'.repeat(64))).toBeNull();
    expect(asProfileEvent({ ...profile({}), created_at: 'now' }, ME)).toBeNull();
    expect(asProfileEvent({ ...profile({}), tags: [[1]] }, ME)).toBeNull();
    expect(asProfileEvent(null, ME)).toBeNull();
  });
});

describe('pickLatestProfile', () => {
  it('takes the newest, ignoring failures', () => {
    const old = profile({ name: 'old' }, { created_at: 1 });
    const fresh = profile({ name: 'new' }, { created_at: 2 });
    expect(pickLatestProfile([old, null, fresh])).toBe(fresh);
  });
});

describe('parseProfileContent', () => {
  it('reads a JSON object and refuses anything else', () => {
    expect(parseProfileContent('{"name":"a"}')).toEqual({ name: 'a' });
    expect(parseProfileContent('not json')).toBeNull();
    expect(parseProfileContent('[1]')).toBeNull();
    expect(parseProfileContent('"name"')).toBeNull();
  });
});

describe('profileForm', () => {
  it('shows strings and leaves the rest empty', () => {
    const form = profileForm({ name: 'alice', about: 42, picture: 'https://x/a.png' });
    expect(form.name).toBe('alice');
    expect(form.about).toBe('');
    expect(form.picture).toBe('https://x/a.png');
    expect(form.lud16).toBe('');
  });

  it('falls back to the deprecated displayName', () => {
    expect(profileForm({ displayName: 'Alice' }).display_name).toBe('Alice');
    expect(profileForm({ display_name: 'A', displayName: 'B' }).display_name).toBe('A');
  });

  it('starts empty without a profile', () => {
    expect(profileForm(null).name).toBe('');
  });
});

describe('changedFields', () => {
  it('reports only what changed, trimmed', () => {
    const initial = profileForm({ name: 'alice', about: 'hi' });
    const current = { ...initial, name: '  bob ', about: 'hi  ' };
    expect(changedFields(initial, current)).toEqual({ name: 'bob' });
  });

  it('reports a cleared field as empty', () => {
    const initial = profileForm({ website: 'https://a.example' });
    expect(changedFields(initial, { ...initial, website: '' })).toEqual({ website: '' });
  });
});

describe('buildProfile', () => {
  it('applies changes and keeps keys it does not edit', () => {
    const base = profile({ name: 'alice', bot: false, custom: { a: 1 } }, { tags: [['i', 'x']] });
    const next = buildProfile(base, { name: 'bob', lud16: 'bob@ln.example' }, ME, 500);
    expect(next).not.toBeNull();
    expect(JSON.parse(next?.content as string)).toEqual({
      name: 'bob',
      bot: false,
      custom: { a: 1 },
      lud16: 'bob@ln.example',
    });
    expect(next?.tags).toEqual([['i', 'x']]);
    expect(next?.kind).toBe(0);
    expect(next?.pubkey).toBe(ME);
  });

  it('removes an emptied field instead of writing ""', () => {
    const next = buildProfile(profile({ name: 'a', website: 'https://a' }), { website: '' }, ME);
    expect(JSON.parse(next?.content as string)).toEqual({ name: 'a' });
  });

  it('drops the deprecated displayName when display_name is edited', () => {
    const base = profile({ displayName: 'Old', display_name: 'Old' });
    const next = buildProfile(base, { display_name: 'New' }, ME);
    expect(JSON.parse(next?.content as string)).toEqual({ display_name: 'New' });
  });

  it('leaves displayName alone when display_name is not edited', () => {
    const next = buildProfile(profile({ displayName: 'Old' }), { name: 'n' }, ME);
    expect(JSON.parse(next?.content as string)).toEqual({ displayName: 'Old', name: 'n' });
  });

  it('steps past the base timestamp', () => {
    expect(buildProfile(profile({}, { created_at: 5000 }), {}, ME, 1000)?.created_at).toBe(5001);
    expect(buildProfile(profile({}, { created_at: 5000 }), {}, ME, 9000)?.created_at).toBe(9000);
  });

  it('starts a new profile without a base', () => {
    const next = buildProfile(null, { name: 'new' }, ME, 1000);
    expect(next).toEqual({
      kind: 0,
      content: '{"name":"new"}',
      tags: [],
      created_at: 1000,
      pubkey: ME,
    });
  });

  it('refuses a base whose content is not an object', () => {
    expect(buildProfile(profile('broken'), { name: 'x' }, ME)).toBeNull();
  });

  it('does not share tag arrays with the base', () => {
    const base = profile({}, { tags: [['i', 'x']] });
    const next = buildProfile(base, {}, ME);
    next?.tags[0]?.push('mutated');
    expect(base.tags).toEqual([['i', 'x']]);
  });
});

describe('validateProfileField', () => {
  it('requires https images', () => {
    expect(validateProfileField('picture', 'https://x.example/a.png')).toBeNull();
    expect(validateProfileField('picture', 'http://x.example/a.png')).not.toBeNull();
    expect(validateProfileField('banner', 'not a url')).not.toBeNull();
  });

  it('accepts http(s) websites', () => {
    expect(validateProfileField('website', 'http://a.example')).toBeNull();
    expect(validateProfileField('website', 'ftp://a.example')).not.toBeNull();
  });

  it('checks addresses', () => {
    expect(validateProfileField('nip05', '_@example.com')).toBeNull();
    expect(validateProfileField('lud16', 'me@ln.example')).toBeNull();
    expect(validateProfileField('nip05', 'example.com')).not.toBeNull();
  });

  it('accepts empty and free text', () => {
    expect(validateProfileField('picture', '  ')).toBeNull();
    expect(validateProfileField('about', 'anything')).toBeNull();
  });
});
