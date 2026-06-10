import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  // Relative base so the build works at any path (e.g. GitHub Pages /combine/).
  // Safe here because routing is hash-based and the document URL never changes.
  base: './',
});
