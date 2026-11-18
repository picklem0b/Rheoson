import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.wrangler/**',
      '**/*.d.ts',
      // Installed skills carry their own scripts and examples. They are
      // reference material, not source we lint.
      'skills/**',
      '.agents/**',
      // main's web app still ships its own ESLint 8 config and lints itself.
      'apps/web/**',
      'agent/**',
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
)
