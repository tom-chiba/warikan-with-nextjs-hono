import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

// vitest-pool-workers v0.16 (Vitest 4) では、旧 defineWorkersConfig/poolOptions ではなく
// cloudflareTest() プラグインで設定する。
//
// projects で 2 系統に分ける:
// - workers: HTTP 経由の統合テスト（Miniflare + D1 起動・マイグレーション適用が必要）
// - unit:    src/lib の純粋関数テスト（Workers/D1 に依存しないため素の node で実行し、
//            Miniflare 起動とマイグレーション適用のコストを払わない）
export default defineConfig(async () => {
  // drizzle が生成したマイグレーションを読み込み、各テストの D1 に適用する。
  const migrations = await readD1Migrations(path.join(here, "drizzle"));

  return {
    test: {
      projects: [
        {
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
                  // (#42 / ADR-0012)。auth.ts は "1" との厳密比較で有効化を判定する。
                  // 本番には存在しないキー。
                  TEST_HASH: "1",
                  // 送信内容をインメモリ受信箱に記録し /__test__/* を有効化する(#70)。
                  EMAIL_TEST_INBOX: "1",
                  // テストでは実送信せず console + 受信箱記録にする。vitest-pool-workers は
                  // wrangler 設定経由で .dev.vars も読み込むため、開発者が実キーを入れていると
                  // 実送信に走り受信箱が空になる（401 等で失敗もする）。テストの決定性を保つため、
                  // .dev.vars の値に依存せず空文字で明示的に上書きして console フォールバックに固定する。
                  RESEND_API_KEY: "",
                },
              },
            }),
          ],
          test: {
            name: "workers",
            include: ["test/routes/**/*.test.ts", "test/middleware/**/*.test.ts", "test/*.test.ts"],
            setupFiles: ["./test/apply-migrations.ts"],
            // testTimeout はデフォルト(5s)のまま。以前は scrypt が重く 30s に引き上げていたが、
            // テストでは SHA-256(TEST_HASH)に差し替えたため不要になった(#42 / ADR-0012)。
          },
        },
        {
          test: {
            name: "unit",
            include: ["test/lib/**/*.test.ts"],
            environment: "node",
          },
        },
      ],
    },
  };
});
