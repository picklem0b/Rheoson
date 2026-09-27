import coreWebVitals from 'eslint-config-next/core-web-vitals';

/**
 * ESLint flat config — eslint-config-next@16 default-exports a native
 * flat-config array from its `core-web-vitals` subpath (Next, React,
 * hooks and jsx-a11y plugins, tuned for App Router). No FlatCompat.
 */
const eslintConfig = [
  ...coreWebVitals,
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'],
  },
];

export default eslintConfig;
