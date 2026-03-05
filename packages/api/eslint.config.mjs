import tseslint from "@typescript-eslint/eslint-plugin";
import parser from "@typescript-eslint/parser";

export default [
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**", "src/**/__tests__/**"],
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      "@typescript-eslint/no-unnecessary-condition": "error",
    },
  },
];
