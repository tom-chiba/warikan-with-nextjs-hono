import type { D1Migration } from "@cloudflare/vitest-pool-workers/config";

// cloudflare:test の env に、wrangler のバインディング(Env) と
// テスト用に注入する TEST_MIGRATIONS を型付けする。
declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[];
  }
}
