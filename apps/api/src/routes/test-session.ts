import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createAuth, SESSION_FRESH_AGE_SECONDS } from "../auth";
import { createDb } from "../db";
import { session as sessionTable } from "../db/schema";

// テスト専用エンドポイント。EMAIL_TEST_INBOX === "1" のときだけ index.ts がマウントするため、
// 本番では露出しない（/__test__/* のガードと同じ条件）。
//
// 目的（#105）: パスキー登録は session.createdAt を基準にしたセッション鮮度（freshAge、既定 24h）
// チェックで 403（SESSION_NOT_FRESH）になる。E2E でその「古いセッション」を再現するのは難所のため、
// 現在ログイン中のセッションの created_at を十分過去（既定 25h 前）へ巻き戻すフックを用意する。
// これにより登録時の再認証フロー（パスワード再入力）を実機同様に検証できる。
export const testSession = new Hono<{ Bindings: Env }>().post("/expire-freshness", async (c) => {
  // 現在のリクエストの cookie からログイン中セッションを解決する。
  const auth = createAuth(c.env);
  const resolved = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!resolved) {
    return c.json({ ok: false, error: "no session" }, 401);
  }
  // freshAge を確実に超える分だけ（+1h のマージン）過去へ created_at を巻き戻す。基準は auth.ts の
  // SESSION_FRESH_AGE_SECONDS に紐づけ、将来 freshAge を変えてもこのフックが自動で追従するようにする。
  const past = new Date(Date.now() - (SESSION_FRESH_AGE_SECONDS + 3600) * 1000);
  const db = createDb(c.env.DB);
  await db
    .update(sessionTable)
    .set({ createdAt: past })
    .where(eq(sessionTable.id, resolved.session.id));
  return c.json({ ok: true });
});
