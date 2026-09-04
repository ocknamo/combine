/**
 * Who the signed-in user follows, and the one path that changes it.
 *
 * A contact list (kind 3) is replaceable: publishing one replaces the whole
 * list, so a follow is not "add a person" but "rewrite everything, plus one".
 * Every guard against rewriting it wrongly funnels through {@link FollowsStore}
 * — the arithmetic is `contacts.ts` and the read is `contactsFetch.ts`; what is
 * decided here is what to do with a fetch that came back thin.
 *
 * The rule that shapes the whole store: **what is displayed and what is
 * published have different freshness requirements.** A button label may be
 * minutes old and merely look wrong for a moment. The base of a write may not
 * be old at all — anything it is missing gets unfollowed. So the cached list
 * answers `isFollowing`, and every change re-fetches from the relays first.
 */
import { auth } from './auth.svelte';
import {
  buildContacts,
  type ContactChange,
  type ContactList,
  changeTarget,
  checkContactsDiff,
  followedPubkeys,
} from './contacts';
import { fetchContacts } from './contactsFetch';
import { signAndPublish } from './publishOwn';
import { toast } from './toast.svelte';

type Status = 'idle' | 'loading' | 'ready' | 'unavailable';

const STORAGE_PREFIX = 'combine:contacts:';

/**
 * Relays that have to agree there is no contact list before combine offers to
 * write a new one. One is not enough: a relay requiring NIP-42 AUTH answers
 * EOSE with nothing, and a user whose one reachable relay does that would be
 * told they have no follows when they have hundreds.
 */
const BOOTSTRAP_QUORUM = 2;

function readStored(pubkey: string): ContactList | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + pubkey);
    if (!raw) return null;
    const stored = JSON.parse(raw) as ContactList;
    return stored.kind === 3 && stored.pubkey === pubkey ? stored : null;
  } catch {
    return null;
  }
}

function writeStored(list: ContactList): void {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + list.pubkey, JSON.stringify(list));
  } catch {
    // Storage full or unavailable: this is a safety net, not the source.
  }
}

class FollowsStore {
  status = $state<Status>('idle');
  /**
   * The people followed, for rendering.
   *
   * Replaced rather than mutated on every change: `$state` does not proxy a
   * `Set`, so `add()` would update nothing on screen.
   */
  set = $state<ReadonlySet<string>>(new Set());
  /** The person a publish is in flight for, or `null`. */
  pending = $state<string | null>(null);
  /**
   * The person to follow once the user agrees to start a contact list from
   * scratch. Set only when {@link BOOTSTRAP_QUORUM} relays said there is none.
   */
  needsBootstrap = $state<string | null>(null);
  /**
   * Bumped by every accepted publish, for views that must re-read the list.
   * Never reset — it is a ticker a `{#key}` compares against its last value, so
   * winding it back on a logout would rebuild the very widgets that just went
   * away (see `TimelineEmbed`).
   */
  revision = $state(0);

  /** The list as last known, whether fetched or published. */
  #base: ContactList | null = null;
  /**
   * The last list this app published.
   *
   * Kept because relays take a moment to serve back what they have just been
   * given: a second follow within that window would otherwise be built on a
   * base that predates the first and undo it. Survives a reload through
   * sessionStorage, which is where that window is widest.
   */
  #published: ContactList | null = null;
  /** Whose list the state above describes — `auth.pubkey` changes silently. */
  #loadedFor: string | null = null;
  #loading: Promise<void> | null = null;

  isFollowing(hex: string): boolean {
    return this.set.has(hex);
  }

  /** Load the list once per account, for display. Cheap to call from a view. */
  async ensureLoaded(): Promise<void> {
    const pubkey = auth.pubkey;
    if (!pubkey) return;
    this.#adoptAccount(pubkey);
    if (this.status === 'ready' || this.#loading) {
      await this.#loading;
      return;
    }
    await this.refresh();
  }

  /** Fetch the list again, whatever is cached. */
  async refresh(): Promise<void> {
    const pubkey = auth.pubkey;
    if (!pubkey) return;
    this.#adoptAccount(pubkey);
    if (this.#loading) return this.#loading;

    this.status = 'loading';
    this.#loading = (async () => {
      const result = await this.#fetchBase(pubkey);
      // An account switch (or a logout) while this was in flight makes the
      // answer somebody else's.
      if (auth.pubkey !== pubkey) return;
      if (result.base) {
        this.#adopt(result.base);
        this.status = 'ready';
      } else if (result.trustworthy) {
        // Nobody has one, and enough relays said so to believe it.
        this.#base = null;
        this.set = new Set();
        this.status = 'ready';
      } else {
        this.status = 'unavailable';
      }
    })().finally(() => {
      this.#loading = null;
    });
    return this.#loading;
  }

  follow(hex: string): Promise<void> {
    return this.#change({ add: hex });
  }

  unfollow(hex: string): Promise<void> {
    return this.#change({ remove: hex });
  }

  /** Follow the person {@link needsBootstrap} names, starting a fresh list. */
  async confirmBootstrap(): Promise<void> {
    const hex = this.needsBootstrap;
    if (!hex) return;
    this.needsBootstrap = null;
    await this.#change({ add: hex }, true);
  }

  cancelBootstrap(): void {
    this.needsBootstrap = null;
  }

  /** Drop everything about the current account (logout, account switch). */
  reset(): void {
    this.status = 'idle';
    this.set = new Set();
    this.pending = null;
    this.needsBootstrap = null;
    this.#base = null;
    this.#published = null;
    this.#loadedFor = null;
    this.#loading = null;
  }

  #adoptAccount(pubkey: string): void {
    if (this.#loadedFor === pubkey) return;
    this.reset();
    this.#loadedFor = pubkey;
    this.#published = readStored(pubkey);
  }

  #adopt(list: ContactList): void {
    this.#base = list;
    this.set = followedPubkeys(list);
  }

  /**
   * The relays to ask for a contact list.
   *
   * Read *and* write: a client that publishes a contact list sends it to the
   * write relays, and someone whose two sets differ would have combine reading
   * from relays that never received it. Asking both costs a few more sockets on
   * a press and removes a whole class of "my follows disappeared".
   */
  async #relays(): Promise<string[]> {
    return [...new Set([...auth.relays, ...(await auth.getWriteRelays())])];
  }

  /**
   * The list to build the next one on.
   *
   * `trustworthy` says whether a `null` base means anything: it is true only
   * when enough relays reached EOSE to believe nobody holds a list, and false
   * when they simply did not answer. Publishing on an untrustworthy `null`
   * would replace an existing list with a list of one.
   */
  async #fetchBase(pubkey: string): Promise<{ base: ContactList | null; trustworthy: boolean }> {
    const relays = await this.#relays();
    const result = await fetchContacts(pubkey, relays);

    const stored = this.#published;
    // `>=` so a tie goes to what this app published: at the same second the
    // relay's copy is either our own coming back, or the one a relay kept when
    // it had to choose between two events of the same age.
    const base =
      stored && (!result.event || stored.created_at >= result.event.created_at)
        ? stored
        : result.event;

    return {
      base,
      trustworthy: result.answered.length >= Math.min(BOOTSTRAP_QUORUM, relays.length),
    };
  }

  async #change(change: ContactChange, allowBootstrap = false): Promise<void> {
    const pubkey = auth.pubkey;
    if (!pubkey) {
      toast.show('フォローするにはログインが必要です。', 'error');
      return;
    }
    const target = changeTarget(change);
    // Following oneself is not a thing combine offers; a stray call is a bug.
    if (target === pubkey) return;
    // One in flight at a time. Two presses would build two lists on the same
    // base, and whichever landed second would undo the first.
    if (this.pending) return;

    this.#adoptAccount(pubkey);
    this.pending = target;
    try {
      const { base, trustworthy } = await this.#fetchBase(pubkey);
      if (auth.pubkey !== pubkey) return;

      if (!base && !allowBootstrap) {
        if (!trustworthy) {
          this.status = 'unavailable';
          toast.show(
            'フォローリストを取得できませんでした。通信状況を確認してもう一度お試しください。',
            'error'
          );
          return;
        }
        // Believable, but starting a list from nothing is exactly the shape of
        // the accident this store exists to prevent. Ask first.
        this.needsBootstrap = target;
        return;
      }
      if (base) this.#adopt(base);

      const following = followedPubkeys(base).has(target);
      if ('add' in change && following) {
        toast.show('すでにフォローしています');
        return;
      }
      if ('remove' in change && !following) {
        toast.show('フォローしていません');
        return;
      }

      const next = buildContacts(base, change, pubkey);
      const reason = checkContactsDiff(base, next, change);
      if (reason) {
        console.error('[combine] kind 3 の更新を中止しました:', reason);
        toast.show('フォローリストを安全に更新できませんでした', 'error');
        return;
      }

      // Write relays too: this is the one event whose loss costs the user
      // every follow they have.
      if (!(await signAndPublish(next, { writeRelays: true }))) {
        toast.show(
          'add' in change ? 'フォローに失敗しました' : 'フォロー解除に失敗しました',
          'error'
        );
        return;
      }

      const published: ContactList = {
        kind: 3,
        pubkey,
        created_at: next.created_at,
        content: next.content,
        tags: next.tags,
      };
      this.#published = published;
      this.#adopt(published);
      writeStored(published);
      this.status = 'ready';
      this.revision += 1;
      toast.show('add' in change ? 'フォローしました' : 'フォローを解除しました');
    } catch (err) {
      // Includes the user declining at nosskey.app — not worth a toast of its
      // own, they know what they just pressed.
      console.error('[combine] follow change failed:', err);
      toast.show(
        'add' in change ? 'フォローに失敗しました' : 'フォロー解除に失敗しました',
        'error'
      );
    } finally {
      this.pending = null;
    }
  }
}

export const follows = new FollowsStore();
