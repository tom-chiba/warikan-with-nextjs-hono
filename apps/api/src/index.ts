import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAuth } from "./auth";
import { provideDb } from "./middleware/provide-db";
import { requireAuth } from "./middleware/require-auth";
import { requireGroupMember } from "./middleware/require-group-member";
import { routes } from "./rpc";
import { testEmail } from "./routes/test-email";

const app = new Hono<{ Bindings: Env }>();

// フロントエンドは別オリジン（dev: localhost:3000）から RPC・認証の双方を呼ぶため、
// 全ルートに CORS を適用する。Better Auth はクッキーセッションを使うため credentials を許可。
// 許可オリジンは実行時 env(WEB_ORIGIN) から取るため、リクエスト内で cors を構築する。
// CORS はルート登録より前に置く必要がある。
app.use("*", (c, next) =>
  cors({
    origin: (c.env.WEB_ORIGIN ?? "http://localhost:3000").split(","),
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })(c, next),
);

// Better Auth のハンドラ（catch-all のため型付き RPC クライアントには含めない。
// フロントエンドは better-auth のクライアントから利用する）。
app.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

// メール送信の動作確認・テスト用ルート（#70）。EMAIL_TEST_INBOX === "1" のときだけ有効化する。
// 本番 wrangler.jsonc にこのフラグは無いため、本番では GET/POST/DELETE とも 404 になる。
// （上の CORS は OPTIONS を 204 で先取りするため、OPTIONS だけはこのガードに到達しない。
// ただしこれは全パス共通の挙動で、本文も機密も返さずエンドポイント存在の判別材料にもならない。）
// "1" との厳密比較は TEST_HASH と同様、"0"/"false" の誤設定で有効化されないようにするため。
app.use("/__test__/*", async (c, next) => {
  if (c.env.EMAIL_TEST_INBOX !== "1") {
    return c.notFound();
  }
  await next();
});
app.route("/__test__", testEmail);

// グループ配下のルートにミドルウェアを適用する。
// Env/DB/auth に依存する処理は Bindings を持つ index.ts 側に集約し、
// rpc.ts / routes は Workers 固有型に依存させない。route 登録より前に置く必要がある。
//
// コレクションレベル（/groups: 作成・一覧）はメンバーシップ不要だがログインは必須。
// db を使うため provideDb も適用する（:groupId を伴わないため requireGroupMember は掛けない）。
app.use("/groups", requireAuth(), provideDb());
// 招待トークンからの参加フロー（/invitations/*）。ログインは必須だが、まだ当該グループの
// メンバーではないため requireGroupMember は通さない（メンバーシップ不要・ログイン必須）。
app.use("/invitations/*", requireAuth(), provideDb());
// member 限定（/groups/:groupId/*）はログイン + 当該グループ所属を要求する。
// ハンドラが db を使うため provideDb も適用する（順序: 認証 → db 注入 → メンバー確認）。
app.use("/groups/:groupId/*", requireAuth(), provideDb(), requireGroupMember());

// 型安全な RPC ルートをマウントする。型は ./rpc の AppType として公開する。
app.route("/", routes);

export type { AppType } from "./rpc";

export default app;
