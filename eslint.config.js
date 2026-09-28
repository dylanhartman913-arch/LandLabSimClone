import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'test-results/**',
      'playwright-report/**',
      'packages/catalog/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Hard rule 1: the engine is pure TypeScript. No UI frameworks, no DOM, no
    // wall-clock time, no unseeded randomness.
    files: ['packages/engine/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'packages/engine must not import React.' },
            { name: 'react-dom', message: 'packages/engine must not import React.' },
            { name: 'pixi.js', message: 'packages/engine must not import PixiJS.' },
            { name: 'zustand', message: 'State stores belong in apps/web.' },
          ],
          patterns: [
            { group: ['react/*', 'react-dom/*', 'pixi.js/*'], message: 'packages/engine must stay UI-free.' },
            {
              group: ['**/apps/*', '@homestead/web', '@homestead/web/*'],
              message: 'packages/engine must not import apps/*.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in state.' },
        { object: 'Date', property: 'now', message: 'The engine has no wall clock.' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'No DOM in the engine.' },
        { name: 'document', message: 'No DOM in the engine.' },
        { name: 'localStorage', message: 'No DOM in the engine.' },
      ],
    },
  },
);
