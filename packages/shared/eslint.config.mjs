import tseslint from 'typescript-eslint';

/**
 * ESLint flat config for the shared contracts package.
 */
export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**'],
  },
  ...tseslint.configs.recommended,
);
