module.exports = {
   root: true,
   env: {
      browser: true,
      es2022: true,
      node: true
   },
   parser: "@typescript-eslint/parser",
   parserOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      ecmaFeatures: {
         jsx: true
      }
   },
   plugins: ["@typescript-eslint", "react", "react-hooks"],
   extends: [
      "eslint:recommended",
      "plugin:@typescript-eslint/recommended",
      "plugin:react/recommended"
   ],
   settings: {
      react: {
         version: "detect"
      }
   },
   rules: {
      "react/react-in-jsx-scope": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn"
   },
   ignorePatterns: ["dist/", "node_modules/"]
};
