import type { MiddlewareHandler } from "hono";
import type { DbVariables } from "../context";
import { createDb } from "../db";

// リクエストスコープの Drizzle インスタンスを Variables に載せる。
// env(D1 バインディング)依存の生成処理を index.ts 側（Bindings: Env を持つグラフ）に閉じ込め、
// ルートハンドラ（rpc.ts グラフ）は context.ts の web-safe な型 DbVariables 経由で db を参照する。
// これにより AppType に Workers 固有型（Env / D1Database）が混入しない（ADR-0009）。
export const provideDb = (): MiddlewareHandler<{ Bindings: Env; Variables: DbVariables }> => {
  return async (c, next) => {
    c.set("db", createDb(c.env.DB));
    await next();
  };
};
