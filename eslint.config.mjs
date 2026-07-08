import js from '@eslint/js';
import globals from 'globals';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

const require = createRequire(import.meta.url);
const nextConfigDirectory = dirname(require.resolve('eslint-config-next/package.json'));
const nextPlugin = require(require.resolve('@next/eslint-plugin-next', {
  paths: [nextConfigDirectory],
}));

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '.worktrees/**',
      'android/**/build/**',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-constant-condition': 'warn',
      'prefer-const': 'warn',
      'react-refresh/only-export-components': 'off',
    },
  }
);
