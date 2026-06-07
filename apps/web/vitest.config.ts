import { fileURLToPath } from "node:url";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // next.config.ts の reactCompiler: true と挙動を揃えるため、テストも
  // React Compiler 変換後のコードで実行する（@vitejs/plugin-react v6 は
  // Babel 非内蔵のため @rolldown/plugin-babel 経由で適用する）。
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  resolve: {
    // tsconfig の "@/*" エイリアスを Vitest でも解決する。
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
