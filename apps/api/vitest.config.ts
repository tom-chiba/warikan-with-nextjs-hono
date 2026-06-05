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
        // 注: 旧 poolOptions の singleWorker は v0.16 の WorkersPoolOptionsSchema に
        // 存在せず無視される(指定しても挙動は変わらない)ため指定しない。
        // 現バージョンは常に 1 Miniflare・D1 共有・テストファイル逐次実行。
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            // セットアップでマイグレーションを適用するため、テストランナーに渡す。
            TEST_MIGRATIONS: migrations,
            // Better Auth 用のテスト値（本番シークレットとは無関係）。
            BETTER_AUTH_SECRET: "test-secret-value-at-least-32-bytes-long",
            BETTER_AUTH_URL: "http://localhost:8787",
            // trustedOrigins 用。CI には .dev.vars が無く wrangler.jsonc の本番値に
            // フォールバックして CSRF 403 になるため、テストではここで固定する。
            WEB_ORIGIN: "http://localhost:3000",
            // パスワードハッシュを scrypt から SHA-256 に差し替えてテストを高速化する
            // (#42 / ADR-0012)。値は任意の truthy 文字列。本番には存在しないキー。
            TEST_HASH: "1",
          },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
      // testTimeout はデフォルト(5s)のまま。以前は scrypt が重く 30s に引き上げていたが、
      // テストでは SHA-256(TEST_HASH)に差し替えたため不要になった(#42 / ADR-0012)。
    },
  };
});
