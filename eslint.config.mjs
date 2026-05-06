// @ts-check
import { includeIgnoreFile } from '@eslint/compat';
import pluginJs from '@eslint/js';
import pluginReactHooks from 'eslint-plugin-react-hooks';
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
    },
  },
);
