/* eslint-env node */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
  ],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  settings: { react: { version: "18" } },
  ignorePatterns: ["dist", "node_modules", "coverage"],
  rules: {
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "no-empty": ["warn", { allowEmptyCatch: true }],
    "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
    "no-console": ["warn", { allow: ["warn", "error", "info"] }],
  },
  overrides: [
    {
      files: ["**/__tests__/**", "**/*.test.{js,jsx}", "src/setup.js"],
      env: { node: true },
      globals: { vi: "readonly", global: "readonly" },
    },
  ],
};
