/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Declared because `vite/client` types every `VITE_*` as `any`, and
   * `nostrCache.ts` hinges on the difference between unset and a URL.
   */
  readonly VITE_OGP_PROXY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
