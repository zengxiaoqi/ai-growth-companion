import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/**
 * ESLint flat config for the React web frontend (lingxi-web).
 *
 * Uses @eslint/js recommended + typescript-eslint recommended as the base.
 * React hooks rules are set to 'warn' (not 'error') to avoid blocking builds
 * on existing code that has hook dependency issues.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'build/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Downgrade react-hooks rules to warnings — existing code has some
      // dependency array issues that need refactoring, not just auto-fixes.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // These are React 19 / ESLint 10 new rules that flag effect patterns
      // common in this codebase. Downgrade to warn to avoid blocking.
      'react-hooks/set-state-in-effect': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Allow console for development
      'no-console': 'off',
      // no-undef is handled by TypeScript
      'no-undef': 'off',
    },
  },
);
