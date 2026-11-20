import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y-x';

export default [
  {ignores: ['dist', 'coverage']},
  js.configs.recommended,
  // Type-aware rules: they use the TypeScript compiler, so they catch unsafe `any`,
  // floating promises and conditions that are always true or false.
  ...tseslint.configs.strictTypeChecked.map((config) => ({...config, files: ['**/*.{ts,tsx}']})),
  // Code smells and bug patterns, the same family of rules as SonarLint/SonarQube.
  sonarjs.configs.recommended,
  // Accessibility of the JSX: labels, keyboard support and valid ARIA. A maintained fork of
  // eslint-plugin-jsx-a11y that supports ESLint 10. The rendered views are audited with
  // axe-core in tests/components/a11y.test.tsx.
  {...jsxA11y.configs.strict, files: ['**/*.tsx']},
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', {allowConstantExport: true}],
      // Numbers in template strings (`${seats} seats`) are intended; other types are not.
      '@typescript-eslint/restrict-template-expressions': ['error', {allowNumber: true}],
      // Short event handlers such as `onClick={() => setOpen(false)}` are idiomatic React.
      '@typescript-eslint/no-confusing-void-expression': ['error', {ignoreArrowShorthand: true}],
      // A React render returns JSX or its children (both ReactNode); not a mixed return type.
      'sonarjs/function-return-type': 'off',
    },
  },
  {
    // Release tooling runs in Node, not the browser.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      // The release script runs `git` from PATH on purpose, on the releaser's own machine.
      'sonarjs/no-os-command-from-path': 'off',
    },
  },
];
