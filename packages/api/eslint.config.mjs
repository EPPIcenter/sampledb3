import tseslint from "@typescript-eslint/eslint-plugin";
import parser from "@typescript-eslint/parser";
import noPromiseTransactionCallback from "./eslint-rules/no-promise-transaction-callback.mjs";

// tsconfig.json leaves out tests (they aren't built); tsconfig.eslint.json adds them so the
// transaction rule has type information there too.
const typedLanguageOptions = {
  parser,
  parserOptions: {
    project: "./tsconfig.eslint.json",
    tsconfigRootDir: import.meta.dirname,
  },
};

export default [
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**"],
  },
  {
    files: ["src/**/*.ts"],
    ignores: ["src/**/__tests__/**"],
    languageOptions: typedLanguageOptions,
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      "@typescript-eslint/no-unnecessary-condition": "error",
    },
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: typedLanguageOptions,
    plugins: {
      local: { rules: { "no-promise-transaction-callback": noPromiseTransactionCallback } },
    },
    rules: {
      "local/no-promise-transaction-callback": "error",
    },
  },
];
