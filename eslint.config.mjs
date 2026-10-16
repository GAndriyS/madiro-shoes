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
    // Node scripts (icon generation etc.)
    files: ['**/scripts/**/*.mjs'],
    languageOptions: {
      globals: { Buffer: 'readonly', console: 'readonly', process: 'readonly' },
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
