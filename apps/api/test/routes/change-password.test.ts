import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { getUserId, signInAndGetCookie, signUpAndGetCookie } from "../helpers/auth-session";

const BASE = env.BETTER_AUTH_URL;

// ブラウザが付与する Origin ヘッダ。Better Auth は cookie 付き POST に origin/referer が
// 無いと CSRF として 403 を返すため、実際のクライアントと同様に origin を明示する。
const WEB_ORIGIN = env.WEB_ORIGIN.split(",")[0];

// Better Auth のパスワード変更エンドポイント（#61）。
// UI は revokeOtherSessions: true で呼ぶため、テストの既定値も合わせる。
function changePassword(
  cookie: string,
  body: { currentPassword?: string; newPassword?: string; revokeOtherSessions?: boolean } = {},
) {
  return SELF.fetch(`${BASE}/api/auth/change-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie, origin: WEB_ORIGIN },
    body: JSON.stringify({
      currentPassword: "password1234",
      newPassword: "new-password1234",
      revokeOtherSessions: true,
      ...body,
    }),
  });
}

// サインインの成否（ステータス）を検証する用途のため、レスポンスをそのまま返す。
function signIn(email: string, password: string) {
  return SELF.fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

describe("POST /api/auth/change-password（パスワード変更）", () => {
  it("正しい現在のパスワードで変更でき、新パスワードでサインインできる", async () => {
    const cookie = await signUpAndGetCookie("cp-basic@example.com");

    const res = await changePassword(cookie);

    expect(res.status).toBe(200);
    const newSignIn = await signIn("cp-basic@example.com", "new-password1234");
    expect(newSignIn.status).toBe(200);
  });

  it("変更後は古いパスワードではサインインできない", async () => {
    const cookie = await signUpAndGetCookie("cp-old@example.com");

    const res = await changePassword(cookie);

    expect(res.status).toBe(200);
    const oldSignIn = await signIn("cp-old@example.com", "password1234");
    expect(oldSignIn.status).toBe(401);
  });

  it("revokeOtherSessions: true で他のセッションは失効し、自セッションは新しい cookie で維持される", async () => {
    const cookie = await signUpAndGetCookie("cp-revoke@example.com");
    const otherCookie = await signInAndGetCookie("cp-revoke@example.com");
    const userId = await getUserId(env.DB, "cp-revoke@example.com");

    const res = await changePassword(cookie);

    expect(res.status).toBe(200);
    // 変更元の端末には新しいセッション cookie が発行される（サインイン維持）。
    const newCookies = res.headers.getSetCookie();
    expect(newCookies.length).toBeGreaterThan(0);
    // 他端末のセッションを含む既存セッションはすべて破棄され、新セッション 1 件だけ残る。
    const sessions = await env.DB.prepare("SELECT id FROM session WHERE user_id = ?")
      .bind(userId)
      .all();
    expect(sessions.results).toHaveLength(1);
    // 他端末の cookie ではセッションが取れない。
    const otherSessionRes = await SELF.fetch(`${BASE}/api/auth/get-session`, {
      headers: { cookie: otherCookie },
    });
    expect(await otherSessionRes.json()).toBeNull();
  });

  it("現在のパスワードが誤っていると変更できない（400 / INVALID_PASSWORD）", async () => {
    const cookie = await signUpAndGetCookie("cp-wrong@example.com");

    const res = await changePassword(cookie, { currentPassword: "wrong-password" });

    expect(res.status).toBe(400);
    const body = await res.json<{ code?: string }>();
    expect(body.code).toBe("INVALID_PASSWORD");
    // 変更されていないこと（元のパスワードでサインインできる）。
    const signInRes = await signIn("cp-wrong@example.com", "password1234");
    expect(signInRes.status).toBe(200);
  });

  it("新パスワードが短すぎると変更できない（400 / PASSWORD_TOO_SHORT）", async () => {
    const cookie = await signUpAndGetCookie("cp-short@example.com");

    // 既定の最小長は 8 文字。
    const res = await changePassword(cookie, { newPassword: "short" });

    expect(res.status).toBe(400);
    const body = await res.json<{ code?: string }>();
    expect(body.code).toBe("PASSWORD_TOO_SHORT");
  });

  it("新パスワードが長すぎると変更できない（400 / PASSWORD_TOO_LONG）", async () => {
    const cookie = await signUpAndGetCookie("cp-long@example.com");

    // 既定の最大長は 128 文字。
    const res = await changePassword(cookie, { newPassword: "a".repeat(129) });

    expect(res.status).toBe(400);
    const body = await res.json<{ code?: string }>();
    expect(body.code).toBe("PASSWORD_TOO_LONG");
  });

  it("未ログインでは変更できない（401）", async () => {
    const res = await SELF.fetch(`${BASE}/api/auth/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "password1234", newPassword: "new-password1234" }),
    });
    expect(res.status).toBe(401);
  });
});
