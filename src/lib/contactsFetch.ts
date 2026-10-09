/**
 * Reading a contact list off the relays, for the follow button to build on.
 *
 * Goes around the in-page cache for the reason every replaceable base does
 * (`replaceableFetch.ts`): a stale kind 3 would unfollow everyone added
 * elsewhere since.
 */
import { asContactList, type ContactList, pickLatest } from './contacts';
import {
  type FetchReplaceableOptions,
  type FetchReplaceableResult,
  fetchReplaceable,
  type ReplaceableKind,
  readReplaceableEvent,
} from './replaceableFetch';

export { isEose, type QuerySocket } from './replaceableFetch';

export type FetchContactsOptions = FetchReplaceableOptions;
export type FetchContactsResult = FetchReplaceableResult<ContactList>;

const CONTACTS: ReplaceableKind<ContactList> = {
  kind: 3,
  parse: asContactList,
  pickLatest,
};

/** This person's contact list out of one incoming frame, or `null`. */
export function readContactEvent(data: unknown, subId: string, pubkey: string): ContactList | null {
  return readReplaceableEvent(data, subId, pubkey, asContactList);
}

/** Ask every relay for one person's contact list. Never rejects. */
export function fetchContacts(
  pubkey: string,
  relays: string[],
  options: FetchContactsOptions = {}
): Promise<FetchContactsResult> {
  return fetchReplaceable(CONTACTS, pubkey, relays, options);
}
