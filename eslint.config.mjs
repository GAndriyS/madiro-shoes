import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/',
      '**/dist/',
      '**/coverage/',
      '**/.turbo/',
      'apps/dashboard/src/routeTree.gen.ts',
      'apps/scanner/src/routeTree.gen.ts',
      'apps/scanner/dev-dist/',
      'apps/dashboard/public/mockServiceWorker.js',
      // sdd-harness framework files: refreshed by its installer, which reports a
      // local edit as a conflict — they are linted where they are written.
      'scripts/verify.mjs',
      'scripts/check-specs.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Node scripts (icon generation, the browser-QA session broker etc.)
    files: ['**/scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        URL: 'readonly',
        WebSocket: 'readonly',
      },
    },
  },
  {
    // The boot guard is a classic browser script served as-is from public/
    files: ['apps/*/public/boot-guard.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { addEventListener: 'readonly', document: 'readonly' },
    },
  },
  prettier,
);
