import { applyD1Migrations, env } from "cloudflare:test";

// 各テストワーカーの D1 に、未適用のマイグレーションをすべて適用する。
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
