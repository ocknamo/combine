/**
 * The profile (NIP-01 kind 0), and the arithmetic of editing one safely.
 *
 * kind 0 is replaceable: what is published *is* the profile. So an edit is
 * applied to the newest copy the relays hold, field by field, and everything
 * combine does not edit — keys it has never heard of, the tags — is carried
 * over untouched. The read is `replaceableFetch.ts`; the screen is
 * `ProfileEditView.svelte`.
 */
import { nextCreatedAt } from './contacts';
import type { UnsignedEvent } from './publishOwn';

/** No `id` or `sig`: combine cannot verify a signature, so it does not carry one. */
export interface ProfileEvent {
  kind: 0;
  pubkey: string;
  created_at: number;
  content: string;
  tags: string[][];
}

/** The keys the edit screen offers, in the order it shows them. */
export const PROFILE_FIELDS = [
  'picture',
  'banner',
  'name',
  'display_name',
  'about',
  'website',
  'nip05',
  'lud16',
] as const;

export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type ProfileForm = Record<ProfileField, string>;

/** A relay's frame read as *this* person's profile event, or `null`. */
export function asProfileEvent(value: unknown, pubkey: string): ProfileEvent | null {
  if (typeof value !== 'object' || value === null) return null;
  const event = value as Record<string, unknown>;
  if (event['kind'] !== 0) return null;
  if (event['pubkey'] !== pubkey) return null;
  if (typeof event['created_at'] !== 'number' || !Number.isFinite(event['created_at'])) return null;
  if (typeof event['content'] !== 'string') return null;
  const tags = event['tags'];
  if (!Array.isArray(tags)) return null;
  if (!tags.every((tag) => Array.isArray(tag) && tag.every((v) => typeof v === 'string'))) {
    return null;
  }
  return {
    kind: 0,
    pubkey,
    created_at: event['created_at'],
    content: event['content'],
    tags: tags as string[][],
  };
}

export function pickLatestProfile(events: (ProfileEvent | null)[]): ProfileEvent | null {
  let best: ProfileEvent | null = null;
  for (const event of events) {
    if (event && (!best || event.created_at > best.created_at)) best = event;
  }
  return best;
}

/**
 * The metadata object in `content`, or `null` when it is not one.
 *
 * `null` is a refusal, not "empty": writing an edit over content that failed to
 * parse would drop whatever it held.
 */
export function parseProfileContent(content: string): Record<string, unknown> | null {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return null;
  }
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * What the form starts with. A value that is not a string is shown empty and,
 * unless the user types into it, never written back.
 */
export function profileForm(meta: Record<string, unknown> | null): ProfileForm {
  const form = {} as ProfileForm;
  for (const key of PROFILE_FIELDS) {
    const value = meta?.[key];
    form[key] = typeof value === 'string' ? value : '';
  }
  // Older clients wrote only the deprecated spelling; show what they see.
  const legacy = meta?.['displayName'];
  if (!form.display_name && typeof legacy === 'string') form.display_name = legacy;
  return form;
}

/** Normalised for comparison and for writing: surrounding whitespace never means anything. */
function clean(value: string): string {
  return value.trim();
}

/** The fields the user actually changed, cleaned. */
export function changedFields(initial: ProfileForm, current: ProfileForm): Partial<ProfileForm> {
  const changes: Partial<ProfileForm> = {};
  for (const key of PROFILE_FIELDS) {
    if (clean(initial[key]) !== clean(current[key])) changes[key] = clean(current[key]);
  }
  return changes;
}

/**
 * The profile event with `changes` applied to `base`, or `null` when `base`
 * cannot be edited safely (its content is not a JSON object).
 *
 * Only changed keys are touched, so a field edited elsewhere while this form
 * was open survives — the caller passes the base fetched at save time. An
 * emptied field is removed rather than written as `""`.
 */
export function buildProfile(
  base: ProfileEvent | null,
  changes: Partial<ProfileForm>,
  pubkey: string,
  now: number = Math.floor(Date.now() / 1000)
): UnsignedEvent | null {
  const meta = base ? parseProfileContent(base.content) : {};
  if (!meta) return null;

  const next: Record<string, unknown> = { ...meta };
  for (const key of PROFILE_FIELDS) {
    const value = changes[key];
    if (value === undefined) continue;
    if (value) next[key] = value;
    else delete next[key];
    // Left behind, the deprecated spelling would keep showing the old name in
    // the clients that still prefer it.
    if (key === 'display_name') delete next['displayName'];
  }

  return {
    kind: 0,
    content: JSON.stringify(next),
    tags: (base?.tags ?? []).map((tag) => [...tag]),
    created_at: nextCreatedAt(base, now),
    pubkey,
  };
}

function isHttpUrl(value: string, protocols: string[]): boolean {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

const ADDRESS = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Why a field's value would not work, or `null`.
 *
 * Images must be https: combine is served over https, and a browser blocks or
 * rewrites http images on such a page.
 */
export function validateProfileField(key: ProfileField, value: string): string | null {
  const v = clean(value);
  if (!v) return null;
  switch (key) {
    case 'picture':
    case 'banner':
      return isHttpUrl(v, ['https:']) ? null : 'https:// で始まる画像の URL を入力してください';
    case 'website':
      return isHttpUrl(v, ['https:', 'http:'])
        ? null
        : 'http(s):// で始まる URL を入力してください';
    case 'nip05':
    case 'lud16':
      return ADDRESS.test(v) ? null : 'name@example.com の形で入力してください';
    default:
      return null;
  }
}
