<script lang="ts">
/**
 * Editing one's own profile (kind 0).
 *
 * The form is a view of the profile as fetched on arrival; what is saved is
 * only what the user changed, applied to the profile as fetched again at save
 * time (`buildProfile`). So a field changed on another device while this was
 * open is not reverted by a save here.
 *
 * Images can be uploaded through the post editor's eHagaki element
 * (`composerUpload.ts`), after being redrawn here (`imagePrep.ts`). The button
 * only appears when the deployed eHagaki has `uploadFile()`; until then the
 * URL fields are the way in.
 */
import { auth } from '../auth.svelte';
import { uploadViaComposer } from '../composerUpload';
import { composerSupportsUpload, uploadErrorMessage } from '../ehagakiComposer';
import { MAX_EDGE, prepareImage } from '../imagePrep';
import { proxiedImageUrl } from '../nostrCache';
import { type BaseVerdict, fetchProfileBase, judgeBase, rememberPublished } from '../profileEdit';
import {
  buildProfile,
  changedFields,
  PROFILE_FIELDS,
  type ProfileField,
  type ProfileForm,
  parseProfileContent,
  profileForm,
  validateProfileField,
} from '../profileMeta';
import { profileRevision } from '../profileRevision.svelte';
import { signAndPublish } from '../publishOwn';
import { router } from '../router.svelte';
import { toast } from '../toast.svelte';
import BackBar from './BackBar.svelte';
import LoginGate from './LoginGate.svelte';

const LABELS: Record<ProfileField, string> = {
  picture: 'アイコン画像',
  banner: 'バナー画像',
  name: '名前（name）',
  display_name: '表示名',
  about: '自己紹介',
  website: 'ウェブサイト',
  nip05: 'NIP-05',
  lud16: 'ライトニングアドレス',
};

const PLACEHOLDERS: Partial<Record<ProfileField, string>> = {
  picture: 'https://…',
  banner: 'https://…',
  website: 'https://…',
  nip05: 'name@example.com',
  lud16: 'name@example.com',
};

const IMAGE_FIELDS = new Set<ProfileField>(['picture', 'banner']);
type ImageField = keyof typeof MAX_EDGE;

let status = $state<'loading' | BaseVerdict>('loading');
let initial = $state<ProfileForm>(profileForm(null));
let form = $state<ProfileForm>(profileForm(null));
let saving = $state(false);
/** The value an image failed to load for, so the message clears once it is edited. */
let brokenImage = $state<Partial<Record<ProfileField, string>>>({});
let canUpload = $state(false);
/** The field an upload is running for. One at a time: the element refuses a second anyway. */
let uploading = $state<ImageField | null>(null);
let uploadTarget: ImageField = 'picture';
let fileInput = $state<HTMLInputElement | null>(null);
let uploadAbort: AbortController | null = null;

const errors = $derived(
  Object.fromEntries(
    PROFILE_FIELDS.map((key) => [key, validateProfileField(key, form[key])])
  ) as Record<ProfileField, string | null>
);
const changes = $derived(changedFields(initial, form));
const dirty = $derived(Object.keys(changes).length > 0);
const valid = $derived(PROFILE_FIELDS.every((key) => errors[key] === null));

async function load(pubkey: string): Promise<void> {
  status = 'loading';
  const result = await fetchProfileBase(pubkey);
  // An account switch while this was in flight makes the answer somebody else's.
  if (auth.pubkey !== pubkey) return;
  const verdict = judgeBase(result);
  if (verdict === 'ready' || verdict === 'new') {
    initial = profileForm(result.base ? parseProfileContent(result.base.content) : null);
    form = { ...initial };
  }
  status = verdict;
}

$effect(() => {
  const pubkey = auth.pubkey;
  if (pubkey) void load(pubkey);
});

// Fetching the bundle here is what lets the button be absent rather than fail
// on press; it is usually cached already by a visit to the post tab.
$effect(() => {
  composerSupportsUpload().then(
    (supported) => {
      canUpload = supported;
    },
    () => {
      canUpload = false;
    }
  );
  return () => uploadAbort?.abort();
});

function pickImage(key: ImageField): void {
  uploadTarget = key;
  fileInput?.click();
}

async function onFilePicked(): Promise<void> {
  const file = fileInput?.files?.[0];
  if (fileInput) fileInput.value = '';
  if (!file || uploading) return;
  const key = uploadTarget;
  uploading = key;
  uploadAbort = new AbortController();
  try {
    const prepared = await prepareImage(file, MAX_EDGE[key]);
    const result = await uploadViaComposer(prepared, uploadAbort.signal);
    form[key] = result.url;
  } catch (err) {
    const message = uploadErrorMessage(err);
    if (message) {
      console.error('[combine] profile image upload failed:', err);
      toast.show(message, 'error');
    }
  } finally {
    uploading = null;
    uploadAbort = null;
  }
}

async function save(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const pubkey = auth.pubkey;
  if (!pubkey || saving || uploading || !dirty || !valid) return;
  saving = true;
  try {
    // Again, rather than the copy the form was built from: minutes may have
    // passed, and the edit has to land on whatever is newest now.
    const result = await fetchProfileBase(pubkey);
    if (auth.pubkey !== pubkey) return;
    const verdict = judgeBase(result);
    if (verdict === 'unavailable') {
      toast.show(
        'プロフィールを取得できませんでした。通信状況を確認してもう一度お試しください。',
        'error'
      );
      return;
    }
    const next = verdict === 'unreadable' ? null : buildProfile(result.base, changes, pubkey);
    if (!next) {
      toast.show('いまのプロフィールを読み取れないため保存できません', 'error');
      return;
    }
    if (!(await signAndPublish(next, { writeRelays: true }))) {
      toast.show('プロフィールの保存に失敗しました', 'error');
      return;
    }
    rememberPublished({ ...next, kind: 0 });
    profileRevision.bump();
    toast.show('プロフィールを保存しました');
    router.go('/profile');
  } catch (err) {
    // Includes the user declining at nosskey.app — they know what they pressed.
    console.error('[combine] profile save failed:', err);
    toast.show('プロフィールの保存に失敗しました', 'error');
  } finally {
    saving = false;
  }
}

function isImageField(key: ProfileField): key is ImageField {
  return IMAGE_FIELDS.has(key);
}

function showPreview(key: ProfileField): boolean {
  return IMAGE_FIELDS.has(key) && form[key].trim() !== '' && errors[key] === null;
}
</script>

<section>
  <BackBar label="プロフィールを編集" />

  {#if !auth.loggedIn}
    <LoginGate message="プロフィールを編集するにはログインが必要です。" />
  {:else if status === 'loading'}
    <p class="empty">プロフィールを読み込んでいます…</p>
  {:else if status === 'unavailable'}
    <div class="empty">
      <p>プロフィールを取得できませんでした。通信状況を確認してください。</p>
      <button type="button" onclick={() => auth.pubkey && load(auth.pubkey)}>再試行</button>
    </div>
  {:else if status === 'unreadable'}
    <p class="empty">いまのプロフィールは形式が壊れているため、ここでは編集できません。</p>
  {:else}
    <form onsubmit={save}>
      {#if status === 'new'}
        <p class="note">プロフィールが見つからなかったので、新しく作成します。</p>
      {/if}

      {#each PROFILE_FIELDS as key (key)}
        <div class="field">
          <label for={`profile-${key}`}>{LABELS[key]}</label>
          {#if key === 'about'}
            <textarea id={`profile-${key}`} rows="4" bind:value={form[key]}></textarea>
          {:else}
            <input
              id={`profile-${key}`}
              type="text"
              inputmode={PLACEHOLDERS[key]?.startsWith('https') ? 'url' : undefined}
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              placeholder={PLACEHOLDERS[key]}
              aria-invalid={errors[key] !== null}
              bind:value={form[key]}
            />
          {/if}
          {#if canUpload && isImageField(key)}
            <button
              type="button"
              class="upload"
              onclick={() => pickImage(key)}
              disabled={uploading !== null || saving}
              aria-busy={uploading === key}
            >
              {uploading === key ? 'アップロードしています…' : '画像をアップロード'}
            </button>
          {/if}
          {#if errors[key]}
            <p class="error">{errors[key]}</p>
          {:else if showPreview(key)}
            {#if brokenImage[key] === form[key]}
              <p class="error">画像を読み込めませんでした</p>
            {:else}
              <img
                class={key}
                src={proxiedImageUrl(form[key].trim(), key === 'banner' ? 960 : 192)}
                alt=""
                onerror={() => {
                  brokenImage = { ...brokenImage, [key]: form[key] };
                }}
              />
            {/if}
          {/if}
        </div>
      {/each}

      <input
        type="file"
        accept="image/*"
        hidden
        bind:this={fileInput}
        onchange={onFilePicked}
      />

      <div class="actions">
        <button type="button" onclick={() => router.back('/profile')} disabled={saving}>
          キャンセル
        </button>
        <button type="submit" class="primary" disabled={saving || uploading !== null || !dirty || !valid}
          aria-busy={saving}>
          {saving ? '保存しています…' : '保存'}
        </button>
      </div>
    </form>
  {/if}
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
  }

  .note {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  label {
    font-size: 0.85rem;
    color: var(--gold-strong);
  }

  textarea {
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.45rem 0.75rem;
    resize: vertical;
  }

  textarea:focus {
    outline: 2px solid var(--gold);
    outline-offset: -1px;
    border-color: var(--gold);
  }

  input[aria-invalid='true'] {
    border-color: var(--danger);
  }

  .error {
    margin: 0;
    font-size: 0.8rem;
    color: var(--danger);
  }

  img {
    border: 1px solid var(--border);
    background: var(--bg-subtle);
    object-fit: cover;
  }

  img.picture {
    width: 96px;
    height: 96px;
    border-radius: 50%;
  }

  img.banner {
    width: 100%;
    aspect-ratio: 3 / 1;
    border-radius: 6px;
  }

  .upload {
    align-self: flex-start;
    font-size: 0.85rem;
    padding: 0.35rem 0.8rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
