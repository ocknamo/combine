import { describe, expect, it } from 'vitest';
import { isTrustworthyEvent, MAX_FUTURE_SECONDS, verifyEvent } from './verifyEvent';
import { signTestEvent } from './verifyEvent.test-helpers';

const signed = signTestEvent({
  kind: 0,
  created_at: 1_800_000_000,
  content: '{"name":"日本語 ✓"}',
  tags: [['t', 'x']],
});

describe('verifyEvent', () => {
  it('accepts an event its author signed', () => {
    expect(verifyEvent(signed)).toBe(true);
  });

  it.each([
    ['content', { content: '{"name":"someone else"}' }],
    ['tags', { tags: [] }],
    ['kind', { kind: 3 }],
    ['created_at', { created_at: signed.created_at + 1 }],
    ['pubkey', { pubkey: 'a'.repeat(64) }],
  ])('refuses one whose %s changed after signing', (_field, change) => {
    expect(verifyEvent({ ...signed, ...change })).toBe(false);
  });

  it('refuses a signature made for a different event', () => {
    const other = signTestEvent({ kind: 0, created_at: 1, content: '{}', tags: [] });
    expect(verifyEvent({ ...signed, sig: other.sig })).toBe(false);
    // The id matches its own content, but the signature is not for that id.
    expect(verifyEvent({ ...other, sig: signed.sig })).toBe(false);
  });

  it.each([
    ['no id', { id: undefined }],
    ['no sig', { sig: undefined }],
    ['an uppercase id', { id: signed.id.toUpperCase() }],
    ['a short sig', { sig: signed.sig.slice(2) }],
    ['a pubkey off the curve', { pubkey: 'f'.repeat(64) }],
    ['a fractional created_at', { created_at: 1.5 }],
    ['tags that are not an array', { tags: 'nope' }],
  ])('refuses an event with %s', (_label, change) => {
    expect(verifyEvent({ ...signed, ...change })).toBe(false);
  });

  it('refuses what is not an event at all', () => {
    expect(verifyEvent(null)).toBe(false);
    expect(verifyEvent('EVENT')).toBe(false);
    expect(verifyEvent({})).toBe(false);
  });
});

describe('isTrustworthyEvent', () => {
  it('allows a little clock skew and no more', () => {
    expect(isTrustworthyEvent(signed, signed.created_at - MAX_FUTURE_SECONDS)).toBe(true);
    expect(isTrustworthyEvent(signed, signed.created_at - MAX_FUTURE_SECONDS - 1)).toBe(false);
  });

  it('still requires the signature', () => {
    expect(isTrustworthyEvent({ ...signed, content: '{}' }, signed.created_at)).toBe(false);
  });
});
