// ESLint для всього монорепозиторію: backend (Node), web і mobile (React), e2e.
// Форматування — за Prettier (див. .prettierrc), тому стильові правила ESLint вимкнено.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.expo/**',
      'backend/uploads/**',
      '**/*.d.ts',
      'test-results/**',
      'playwright-report/**',
      'certs/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['backend/**/*.{ts,mjs}', 'e2e/**/*.ts', 'scripts/**/*.{js,mjs}', '*.{js,mjs,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['web/src/**/*.{ts,tsx}', 'mobile/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    rules: {
      // відповіді API типізуються на межі (zod на сервері, типи в api/types на клієнтах)
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true },
      ],
    },
  },
  prettier,
);
