import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

// 型安全な RPC ルート。auth/db など Workers 固有のグローバル型（Env / D1Database）に
// 依存させないことで、フロントエンド側が AppType を import しても型解決が完結する。
export const routes = new Hono()
  .get("/", (c) => c.json({ message: "warikan API" }))
  .get("/hello", zValidator("query", z.object({ name: z.string().optional() })), (c) => {
    const { name } = c.req.valid("query");
    return c.json({ message: `Hello, ${name ?? "world"}!` });
  });

export type AppType = typeof routes;
