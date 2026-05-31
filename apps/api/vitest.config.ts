import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

// vitest-pool-workers v0.16 (Vitest 4) では、旧 defineWorkersConfig/poolOptions ではなく
// cloudflareTest() プラグインで設定する。
export default defineConfig(async () => {
  // drizzle が生成したマイグレーションを読み込み、各テストの D1 に適用する。
  const migrations = await readD1Migrations(path.join(here, "drizzle"));

  return {
    plugins: [
      cloudflareTest({
        singleWorker: true,
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            // セットアップでマイグレーションを適用するため、テストランナーに渡す。
            TEST_MIGRATIONS: migrations,
            // Better Auth 用のテスト値（本番シークレットとは無関係）。
            BETTER_AUTH_SECRET: "test-secret-value-at-least-32-bytes-long",
            BETTER_AUTH_URL: "http://localhost:8787",
          },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
      // Better Auth のパスワードハッシュ(scrypt)は Miniflare 上で重く、
      // デフォルトの 5s timeout を超えることがあるため引き上げる。
      testTimeout: 30_000,
    },
  };
});
