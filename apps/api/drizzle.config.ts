import { defineConfig } from "drizzle-kit";

// マイグレーション SQL の生成にのみ使用する（dialect=sqlite で十分）。
// 生成された SQL は wrangler の d1 migrations で D1 に適用する。
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
});
