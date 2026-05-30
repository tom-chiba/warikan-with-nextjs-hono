import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAuth } from "./auth";
import { routes } from "./rpc";

const app = new Hono<{ Bindings: Env }>();

// フロントエンドは別オリジン（dev: localhost:3000）から RPC・認証の双方を呼ぶため、
// 全ルートに CORS を適用する。Better Auth はクッキーセッションを使うため credentials を許可。
// CORS はルート登録より前に置く必要がある。
app.use(
  "*",
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

// 型安全な RPC ルートをマウントする。型は ./rpc の AppType として公開する。
app.route("/", routes);

export type { AppType } from "./rpc";

export default app;
