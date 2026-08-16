import { defineConfig, globalIgnores } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';

export default defineConfig(
  globalIgnores([
    'coverage',
    'node_modules',
    'esbuild.config.mjs',
    'version-bump.mjs',
    'versions.json',
    'main.js',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
  ]),
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.mjs', 'manifest.json', 'scripts/verify-release.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.json'],
      },
    },
  },
  ...obsidianmd.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      'obsidianmd/ui/sentence-case': [
        'error',
        {
          brands: ['Recap Raven'],
          enforceCamelCaseLower: true,
          ignoreRegex: ['recap-raven, session-recap'],
        },
      ],
    },
  },
  {
    files: ['src/settings/settings-tab.ts', 'tests/settings/settings-tab.test.ts'],
    rules: {
      // Keep the imperative settings API while minAppVersion supports Obsidian 1.11.4.
      '@typescript-eslint/no-deprecated': 'off',
      'obsidianmd/settings-tab/prefer-setting-definitions': 'off',
    },
  },
  {
    files: ['tests/mocks/obsidian.ts', 'tests/setup.ts'],
    rules: {
      // The test harness models Obsidian's DOM extensions in a plain browser DOM.
      'obsidianmd/no-global-this': 'off',
      'obsidianmd/prefer-create-el': 'off',
    },
  },
);
