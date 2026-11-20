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
    coverage: {
      provider: 'v8',
      // Every source file counts, also those no test imports, so untested code shows up.
      include: ['src/**/*.{ts,tsx}'],
      // main.tsx only mounts the app; types.ts and the .d.ts files hold types, no code.
      exclude: ['src/main.tsx', 'src/types.ts', 'src/**/*.d.ts'],
      reporter: ['text-summary', 'text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      // A run fails when any file drops below these: every file stays green (80% or more
      // in the report). Pure logic modules are held to more, except on branches, where
      // they handle malformed data files that the data tests keep out.
      thresholds: {
        perFile: true,
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
        'src/data/**/*.ts': {statements: 90, branches: 80, functions: 95, lines: 90},
        'src/components/*.ts': {statements: 90, branches: 80, functions: 95, lines: 90},
      },
    },
    projects: [
      // Code: behaviour of the loader, comparison and formatting logic on small fixtures.
      { extends: true, test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' } },
      // Data: consistency of every country's resource files, read through the real loader.
      { extends: true, test: { name: 'data', include: ['tests/data/**/*.test.ts'], environment: 'node' } },
      // Components: the views rendered in a simulated browser and used like a visitor would.
      {
        extends: true,
        test: {
          name: 'components',
          include: ['tests/components/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['tests/components/setup.ts'],
        },
      },
    ],
  },
});
