const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['node_modules/', 'dist/', 'coverage/', '.expo/', 'android/', 'ios/'],
  },
  {
    // The domain layer is pure TypeScript: no UI, platform or storage imports.
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '^(react|react-native|expo|drizzle-orm|zustand)([-/].*)?$|^@(expo|react-native|react-navigation)/',
              message: 'src/domain must not depend on React, Expo or storage libraries.',
            },
            {
              regex: '^(@/|(\\.\\.?/)+)(data|features|ui|i18n)(/|$)',
              message: 'src/domain must not depend on other layers.',
            },
          ],
        },
      ],
    },
  },
]);
