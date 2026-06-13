import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { clearEmails, latestEmailTo, type SentEmail } from "../helpers/email-inbox";

const BASE = env.BETTER_AUTH_URL;

// ブラウザが付与する Origin ヘッダ。Better Auth は origin/referer が trustedOrigins 外だと
// CSRF として弾くため、実際のクライアントと同様に origin を明示する。
const WEB_ORIGIN = env.WEB_ORIGIN.split(",")[0];

// サインアップする。requireEmailVerification: true 有効時はセッションを発行せず、確認メールを送る。
function signUp(email: string, password = "password1234", name = "Verify User") {
  return SELF.fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: WEB_ORIGIN },
    body: JSON.stringify({ name, email, password }),
  });
}

function signIn(email: string, password = "password1234") {
  return SELF.fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: WEB_ORIGIN },
    body: JSON.stringify({ email, password }),
  });
}

// 受信箱から指定宛先の最新メールの確認リンク URL を取り出す。
// リンクは ${BASE}/api/auth/verify-email?token=<JWT>&callbackURL=... の形。
function extractVerifyUrl(email: SentEmail): string {
  const body = email.text ?? email.html ?? "";
  const match = body.match(/https?:\/\/[^\s"]+\/api\/auth\/verify-email\?[^\s"]+/);
  if (!match) {
    throw new Error(`verify link not found in email body: ${body}`);
  }
  return match[0];
}

describe("サインアップ時のメールアドレス検証（#69）", () => {
  // 受信箱はモジュールスコープで蓄積されるため、テスト間でクリアして独立性を保つ。
  beforeEach(async () => {
    await clearEmails();
  });

  it("サインアップすると確認メールが届き、セッションは発行されない（仮登録）", async () => {
    const res = await signUp("ve-signup@example.com");
    expect(res.status).toBe(200);
    // requireEmailVerification 有効時はサインアップで自動サインインしないため Cookie は出ない。
    expect(res.headers.getSetCookie()).toHaveLength(0);

    const mail = await latestEmailTo("ve-signup@example.com");
    expect(mail.subject).toContain("メールアドレス確認");
    expect(extractVerifyUrl(mail)).toBeTruthy();
  });

  it("未検証のままではサインインできず、403 で確認メールが再送される", async () => {
    await signUp("ve-unverified@example.com");
    await clearEmails();

    const res = await signIn("ve-unverified@example.com");
    expect(res.status).toBe(403);
    const body = await res.json<{ code?: string }>();
    expect(body.code).toBe("EMAIL_NOT_VERIFIED");

    // sendOnSignIn により、未検証サインインのたびに確認メールが再送される。
    const mail = await latestEmailTo("ve-unverified@example.com");
    expect(extractVerifyUrl(mail)).toBeTruthy();
  });

  it("確認リンクを踏むと検証済みになり、サインインできる", async () => {
    await signUp("ve-verify@example.com");
    const url = extractVerifyUrl(await latestEmailTo("ve-verify@example.com"));

    // 確認リンク（GET）を踏むと検証され、autoSignInAfterVerification によりセッション Cookie が発行され、
    // callbackURL へ 302 リダイレクトする。
    const verifyRes = await SELF.fetch(url, { redirect: "manual" });
    expect(verifyRes.status).toBe(302);
    expect(verifyRes.headers.getSetCookie().length).toBeGreaterThanOrEqual(1);

    // 検証後はサインインできる。
    const signInRes = await signIn("ve-verify@example.com");
    expect(signInRes.status).toBe(200);
  });

  it("期限切れ・無効なトークンでは検証できず、callbackURL に error を付けて戻す", async () => {
    // メール内リンクと同形だが、明らかに無効なトークンを与える。
    const callbackURL = `${WEB_ORIGIN}/verify-email`;
    const res = await SELF.fetch(
      `${BASE}/api/auth/verify-email?token=obviously-invalid&callbackURL=${encodeURIComponent(callbackURL)}`,
      { redirect: "manual" },
    );
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    // INVALID_TOKEN / TOKEN_EXPIRED いずれも error クエリ付きで callbackURL に戻る。
    expect(location).toContain(`${callbackURL}?error=`);
  });

  it("確認メールは明示的に再送できる（届かなかった場合の導線）", async () => {
    await signUp("ve-resend@example.com");
    await clearEmails();

    const res = await SELF.fetch(`${BASE}/api/auth/send-verification-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: WEB_ORIGIN },
      body: JSON.stringify({ email: "ve-resend@example.com", callbackURL: "/" }),
    });
    expect(res.status).toBe(200);

    const mail = await latestEmailTo("ve-resend@example.com");
    expect(extractVerifyUrl(mail)).toBeTruthy();
  });
});
