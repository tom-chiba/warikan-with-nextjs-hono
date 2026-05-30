import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { createAuth } from "./auth";

const app = new Hono<{ Bindings: Env }>();

// Better Auth はクッキーセッションを使うため、フロントエンドのオリジンに対して
// credentials を許可する。CORS はルート登録より前に置く必要がある。
app.use(
  "/api/auth/*",
  cors({
    origin: "http://localhost:3000",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  }),
);

// Better Auth のハンドラ（catch-all のため型付き RPC クライアントには含めない。
// フロントエンドは better-auth のクライアントから利用する）。
app.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

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
