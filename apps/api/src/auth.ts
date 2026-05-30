import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createDb } from "./db";
import * as schema from "./db/schema";

// D1 バインディングや secret は実行時 env から渡るため、
// auth インスタンスはシングルトンにせずリクエストごとに生成する。
export function createAuth(env: Env) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    // ブラウザは別オリジン(dev: localhost:3000)から認証を呼ぶため、CSRF 用に信頼する。
    // 本番では実際の web オリジンを設定する。
    trustedOrigins: ["http://localhost:3000"],
    database: drizzleAdapter(createDb(env.DB), {
      provider: "sqlite",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
