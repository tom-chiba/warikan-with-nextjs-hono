import { defineConfig, devices } from "@playwright/test";

// E2E はスタック横断（web → api）のためルートに配置する。
// webServer で api(:8787) と web(:3000) の dev を起動してからテストする。
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // #69 で全サインアップが確認メールを送るようになり、Better Auth の送信は runInBackgroundOrAwait
  // （waitUntil）でレスポンス後に走る。並列実行下の wrangler dev では稀にこの背景送信が遅延/取りこぼし、
  // 受信箱（インメモリ）にメールが現れないことがある。新規サインアップし直す再試行で解消する性質のため、
  // ローカルでも 1 回再試行する（CI は 2 回）。fetchEmailLink 側も expect.poll で一定時間待つ。
  retries: process.env.CI ? 2 : 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @warikan/api dev",
      port: 8787,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @warikan/web dev",
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
