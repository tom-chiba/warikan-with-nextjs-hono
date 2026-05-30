import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

const app = new Hono();

// メソッドチェーンで定義したルートの型を AppType として公開し、
// フロントエンド側で hc<AppType>() による型安全な RPC クライアントに利用する。
const routes = app
  .get("/", (c) => c.json({ message: "warikan API" }))
  .get("/hello", zValidator("query", z.object({ name: z.string().optional() })), (c) => {
    const { name } = c.req.valid("query");
    return c.json({ message: `Hello, ${name ?? "world"}!` });
  });

export type AppType = typeof routes;

export default app;
