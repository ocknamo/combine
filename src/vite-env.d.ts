/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * CORS proxy the timeline widgets fetch link previews through, if any.
   *
   * Declared here because `vite/client` types every other `VITE_*` as `any`,
   * and the code below leans on the difference between an unset value and a
   * URL: unset means the app passes no `ogp-proxy` at all (see `nostrCache.ts`).
   */
  readonly VITE_OGP_PROXY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
