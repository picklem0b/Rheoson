import tseslint from 'typescript-eslint';

/**
 * ESLint flat config for the server — typescript-eslint recommended.
 * Test files are linted too; nothing project-specific to carve out yet.
 */
export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**'],
  },
  ...tseslint.configs.recommended,
);
