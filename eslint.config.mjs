// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
// @ts-check
import { includeIgnoreFile } from '@eslint/compat';
import pluginJs from '@eslint/js';
import pluginReactHooks from 'eslint-plugin-react-hooks';
import storybook from 'eslint-plugin-storybook';
import pluginTestingLibrary from 'eslint-plugin-testing-library';
import globals from 'globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pluginTs from 'typescript-eslint';

import pluginQuery from '@tanstack/eslint-plugin-query';

const gitignorePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '.gitignore',
);

export default pluginTs.config(
  includeIgnoreFile(gitignorePath),
  pluginJs.configs.recommended,
  // Source files config
  {
    name: 'src',
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    extends: [
      pluginTs.configs.recommended,
      pluginQuery.configs['flat/recommended'],
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      'react-hooks': pluginReactHooks,
    },
    rules: {
      ...pluginReactHooks.configs.recommended.rules,
      curly: ['error', 'multi-line'],
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'object-shorthand': 'error',
      'no-nested-ternary': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'default',
          format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
        },
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        {
          selector: 'function',
          format: ['camelCase', 'PascalCase'],
        },
        {
          selector: 'objectLiteralProperty',
          modifiers: ['requiresQuotes'],
          format: null,
        },
      ],
    },
  },
  // Test files config
  {
    name: 'tests',
    files: ['tests/**/*.{js,jsx,ts,tsx}', 'src/**/*.test.{js,jsx,ts,tsx}'],
    extends: [
      pluginTs.configs.recommended,
      pluginTestingLibrary.configs['flat/react'],
    ],
    rules: {
      'testing-library/render-result-naming-convention': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
        },
      ],
    },
  },
  // E2E tests use Playwright page.getBy*() — disable Testing Library rules
  // that misfire on identically-named Playwright query methods.
  {
    name: 'e2e',
    files: ['tests/e2e/**/*.{js,jsx,ts,tsx}'],
    rules: {
      'testing-library/prefer-screen-queries': 'off',
    },
  },
  // Storybook config files
  {
    name: 'storybook',
    files: ['.storybook/**/*.{js,jsx,ts,tsx}'],
    extends: [pluginTs.configs.recommended],
  },
  // Scripts — Node.js runtime, not browser
  {
    name: 'scripts',
    files: ['scripts/**/*.{js,jsx,ts,tsx}'],
    extends: [pluginTs.configs.recommended],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  storybook.configs['flat/recommended'],
);
