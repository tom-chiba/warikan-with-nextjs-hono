import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

// apps/web 専用の ESLint 設定（ADR-0014）。React Hooks ルールと React Compiler の
// 診断（purity / preserve-manual-memoization 等。v7 で recommended に統合）のみを担い、
// TypeScript / unicorn などの汎用 lint は引き続き oxlint が担当する（ADR-0003）。
export default [
  {
    ...reactHooks.configs.flat.recommended,
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { parser: tsParser },
  },
];
