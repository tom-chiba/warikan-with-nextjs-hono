import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { getUserId, signUpAndGetCookie } from "../helpers/auth-session";
import { clearEmails, listEmails, type SentEmail } from "../helpers/email-inbox";

const BASE = env.BETTER_AUTH_URL;

// ブラウザが付与する Origin ヘッダ。Better Auth は origin/referer が無い、または trustedOrigins
// 外だと CSRF として弾くため、実際のクライアントと同様に origin を明示する。
const WEB_ORIGIN = env.WEB_ORIGIN.split(",")[0];

// 再設定メールを要求する。redirectTo は Web の /reset-password を指す（実クライアントと同様）。
function requestPasswordReset(email: string) {
  return SELF.fetch(`${BASE}/api/auth/request-password-reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: WEB_ORIGIN },
    body: JSON.stringify({ email, redirectTo: `${WEB_ORIGIN}/reset-password` }),
  });
}

// トークンで新パスワードを設定する。reset-password は token を body でも受け付ける。
function resetPassword(token: string, newPassword: string) {
  return SELF.fetch(`${BASE}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: WEB_ORIGIN },
    body: JSON.stringify({ token, newPassword }),
  });
}

function signIn(email: string, password: string) {
  return SELF.fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

// 受信したメール本文から再設定リンクのトークンを取り出す。
// リンクは ${BASE}/api/auth/reset-password/<token>?callbackURL=... の形。
function extractToken(email: SentEmail): string {
  const body = email.text ?? email.html ?? "";
  const match = body.match(/\/reset-password\/([^?\s"]+)/);
  if (!match) {
    throw new Error(`reset link not found in email body: ${body}`);
  }
  return match[1];
}

describe("パスワード再設定（#68）", () => {
  // 受信箱はモジュールスコープで蓄積されるため、テスト間でクリアして独立性を保つ。
  beforeEach(async () => {
    await clearEmails();
  });

  it("登録済みメールには再設定リンク付きメールが届く", async () => {
    await signUpAndGetCookie("rp-found@example.com");

    const res = await requestPasswordReset("rp-found@example.com");
    expect(res.status).toBe(200);

    const emails = await listEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe("rp-found@example.com");
    // リンクからトークンを取り出せる（text・html の双方に含まれる）。
    expect(extractToken(emails[0])).toBeTruthy();
  });

  it("未登録メールでも登録済みと同じ 200 を返し、メールは送らない（列挙対策）", async () => {
    const known = await requestPasswordReset("rp-unknown@example.com");
    expect(known.status).toBe(200);

    // 登録済みと同じく status:true のボディ。ステータス・形でも区別がつかない。
    const body = await known.json<{ status?: boolean }>();
    expect(body.status).toBe(true);

    // 未登録では sendResetPassword を呼ばないため受信箱は空のまま。
    const emails = await listEmails();
    expect(emails).toHaveLength(0);
  });

  it("届いたトークンで新パスワードを設定でき、新パスワードでサインインできる", async () => {
    await signUpAndGetCookie("rp-reset@example.com");
    await requestPasswordReset("rp-reset@example.com");
    const token = extractToken((await listEmails())[0]);

    const res = await resetPassword(token, "new-password1234");
    expect(res.status).toBe(200);

    const newSignIn = await signIn("rp-reset@example.com", "new-password1234");
    expect(newSignIn.status).toBe(200);
  });

  it("再設定後は古いパスワードではサインインできない", async () => {
    await signUpAndGetCookie("rp-old@example.com");
    await requestPasswordReset("rp-old@example.com");
    const token = extractToken((await listEmails())[0]);

    await resetPassword(token, "new-password1234");

    const oldSignIn = await signIn("rp-old@example.com", "password1234");
    expect(oldSignIn.status).toBe(401);
  });

  it("revokeSessionsOnPasswordReset で既存セッションがすべて失効する", async () => {
    // サインアップ時に 1 件、別サインインで合計 2 件のセッションを作る。
    await signUpAndGetCookie("rp-revoke@example.com");
    const before = await signIn("rp-revoke@example.com", "password1234");
    expect(before.status).toBe(200);
    const userId = await getUserId(env.DB, "rp-revoke@example.com");
    const sessionsBefore = await env.DB.prepare("SELECT id FROM session WHERE user_id = ?")
      .bind(userId)
      .all();
    expect(sessionsBefore.results.length).toBeGreaterThanOrEqual(2);

    await requestPasswordReset("rp-revoke@example.com");
    const token = extractToken((await listEmails())[0]);
    const res = await resetPassword(token, "new-password1234");
    expect(res.status).toBe(200);

    // 再設定では新しいセッション Cookie を発行しない（自動サインインしない）ため、全件失効する。
    const sessionsAfter = await env.DB.prepare("SELECT id FROM session WHERE user_id = ?")
      .bind(userId)
      .all();
    expect(sessionsAfter.results).toHaveLength(0);
  });

  it("使用済みトークンでは再設定できない（INVALID_TOKEN）", async () => {
    await signUpAndGetCookie("rp-used@example.com");
    await requestPasswordReset("rp-used@example.com");
    const token = extractToken((await listEmails())[0]);

    const first = await resetPassword(token, "new-password1234");
    expect(first.status).toBe(200);

    // 一度使うと検証値が削除されるため、同じトークンは再利用できない。
    const second = await resetPassword(token, "another-password1234");
    expect(second.status).toBe(400);
    const body = await second.json<{ code?: string }>();
    expect(body.code).toBe("INVALID_TOKEN");
  });

  it("無効なトークンでは再設定できない（INVALID_TOKEN）", async () => {
    const res = await resetPassword("obviously-invalid-token", "new-password1234");
    expect(res.status).toBe(400);
    const body = await res.json<{ code?: string }>();
    expect(body.code).toBe("INVALID_TOKEN");
  });

  it("再設定リンク（GET）は有効なトークンを callbackURL に渡してリダイレクトする", async () => {
    await signUpAndGetCookie("rp-callback@example.com");
    await requestPasswordReset("rp-callback@example.com");
    const token = extractToken((await listEmails())[0]);

    // メールのリンク（GET）を踏むと Web の /reset-password へ ?token= 付きでリダイレクトされる。
    const callbackURL = `${WEB_ORIGIN}/reset-password`;
    const res = await SELF.fetch(
      `${BASE}/api/auth/reset-password/${token}?callbackURL=${encodeURIComponent(callbackURL)}`,
      { redirect: "manual" },
    );
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain(`${callbackURL}?token=`);
  });
});
