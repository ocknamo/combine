/**
 * Who the signed-in user follows, and the one path that changes it.
 *
 * A follow is not "add a person" but "rewrite the whole list, plus one", so
 * what this store decides is what to do with a fetch that came back thin (the
 * arithmetic is `contacts.ts`, the read `contactsFetch.ts`).
 *
 * The rule that shapes it: **display and publish need different freshness.** A
 * stale button label looks wrong for a moment; a stale base unfollows everyone
 * it is missing. So the cache answers `isFollowing` and every change re-fetches.
 */
import { auth } from './auth.svelte';
import {
  asContactList,
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
 * Relays that must agree there is no contact list before offering to write a
 * new one — or every relay asked, when there are fewer than this.
 *
 * One voice is weak evidence: a NIP-42 relay answers EOSE with nothing, and
 * someone with hundreds of follows would be told they have none. Someone on a
 * single relay is asked anyway rather than locked out forever — there is no
 * second opinion to be had, and the prompt is a warning they must accept.
 */
const BOOTSTRAP_QUORUM = 2;

/**
 * Held to the same standard as a relay's answer — it feeds the same publish
 * path. An entry missing `created_at` makes `nextCreatedAt` produce `NaN`, and
 * every comparison against `NaN` is false, so it would be signed unchecked.
 */
function readStored(pubkey: string): ContactList | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + pubkey);
    return raw ? asContactList(JSON.parse(raw), pubkey) : null;
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
  /** Replaced, never mutated: `$state` does not proxy a `Set`. */
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
   * Never reset: `{#key}` compares it against its last value, so winding it
   * back would rebuild the widgets that just went away (`TimelineEmbed`).
   */
  revision = $state(0);

  /** The list as last known, whether fetched or published. */
  #base: ContactList | null = null;
  /**
   * The last list this app published. Relays take a moment to serve back what
   * they were just given, and a second follow inside that window would build on
   * a base predating the first and undo it.
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
      if (result.answered === 0) {
        // Nothing heard, so nothing known — including whether our own copy is
        // still current.
        this.status = 'unavailable';
      } else if (result.base) {
        this.#adopt(result.base);
        this.status = 'ready';
      } else {
        // Nobody has one and a relay said so rather than went quiet: enough to
        // render a button. Writing a new list needs the higher bar in `#change`.
        this.#base = null;
        this.set = new Set();
        this.status = 'ready';
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
   * Read *and* write: a client publishes a contact list to the write relays, so
   * someone whose two sets differ would have combine reading from relays that
   * never received it.
   */
  async #relays(): Promise<string[]> {
    return [...new Set([...auth.relays, ...(await auth.getWriteRelays())])];
  }

  /**
   * The list to build the next one on, and how much the relays actually said.
   *
   * Two questions ride on `answered` at different bars: publishing at all needs
   * one relay to have answered (our own copy is no substitute — a follow made
   * elsewhere since would not be in it); starting a list from nothing needs
   * {@link BOOTSTRAP_QUORUM}, a far higher bar for a far worse mistake.
   */
  async #fetchBase(
    pubkey: string
  ): Promise<{ base: ContactList | null; answered: number; asked: number }> {
    const relays = await this.#relays();
    const result = await fetchContacts(pubkey, relays);

    const stored = this.#published;
    // `>=` so a tie goes to our own: at the same second the relay's copy is
    // either ours coming back, or the one it kept between two events of one age.
    const base =
      stored && (!result.event || stored.created_at >= result.event.created_at)
        ? stored
        : result.event;

    return { base, answered: result.answered.length, asked: relays.length };
  }

  async #change(change: ContactChange, allowBootstrap = false): Promise<void> {
    const pubkey = auth.pubkey;
    if (!pubkey) {
      toast.show('フォローするにはログインが必要です。', 'error');
      return;
    }
    const target = changeTarget(change);
    if (target === pubkey) return;
    // Two presses would build two lists on one base, and the second would undo
    // the first.
    if (this.pending) return;

    this.#adoptAccount(pubkey);
    this.pending = target;
    try {
      const { base, answered, asked } = await this.#fetchBase(pubkey);
      if (auth.pubkey !== pubkey) return;

      // Whether or not a base was found: our stored copy makes a silent network
      // look healthy, and building on it drops every follow made elsewhere.
      if (answered === 0) {
        this.status = 'unavailable';
        toast.show(
          'フォローリストを取得できませんでした。通信状況を確認してもう一度お試しください。',
          'error'
        );
        return;
      }

      if (!base && !allowBootstrap) {
        if (answered < Math.min(BOOTSTRAP_QUORUM, asked)) {
          this.status = 'unavailable';
          toast.show(
            'フォローリストを取得できませんでした。通信状況を確認してもう一度お試しください。',
            'error'
          );
          return;
        }
        // Believable, but this is the shape of the accident the store exists to
        // prevent. Ask first.
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
