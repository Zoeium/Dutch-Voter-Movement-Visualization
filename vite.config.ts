import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// https://vitejs.dev/config/
export default defineConfig({
  // Relative asset URLs, so the build works from any folder - including the
  // /<repository>/ subfolder GitHub Pages serves it from.
  base: './',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  assetsInclude: ['**/*.yaml'],
  test: {
    projects: [
      // Code: behaviour of the loader, comparison and formatting logic on small fixtures.
      { extends: true, test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' } },
      // Data: consistency of every country's resource files, read through the real loader.
      { extends: true, test: { name: 'data', include: ['tests/data/**/*.test.ts'], environment: 'node' } },
    ],
  },
});
