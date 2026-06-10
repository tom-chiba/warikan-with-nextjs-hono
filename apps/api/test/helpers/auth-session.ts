import { env, SELF } from "cloudflare:test";

// API のオリジン。テスト環境では vitest.config.ts の miniflare bindings で
// BETTER_AUTH_URL を注入しているため、それを単一ソースとして利用する。
const BASE = env.BETTER_AUTH_URL;

// レスポンスの Set-Cookie から cookie ヘッダ値を組み立てる。
// 複数の Set-Cookie（将来 CSRF 等が増えても）を取りこぼさないよう getSetCookie() を使う。
// 各 Cookie の属性(Path 等)を除いた name=value 部分だけを連結して cookie ヘッダ値にする。
function cookieHeaderFrom(res: Response, context: string): string {
  const cookies = res.headers.getSetCookie();
  if (cookies.length === 0) {
    throw new Error(`${context} did not return a session cookie`);
  }
  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

// サインアップして検証済みにし、セッションクッキーを取得するテストヘルパー。
// #69 で requireEmailVerification: true を有効化したため、サインアップ直後は emailVerified=false で
// セッションも発行されず、未検証ユーザーのサインインは 403 になる。多数のテストは「認証済みユーザーの
// Cookie」を前提とするため、ここではサインアップ後に D1 を直接更新して検証済みにし、サインインで
// Cookie を取得する。確認メール送信〜リンク踏破の検証フロー自体は専用テスト（verify-email.test.ts /
// e2e）で担保し、ここではそのコストとメール受信箱への依存を持ち込まない。
export async function signUpAndGetCookie(
  email: string,
  password = "password1234",
  name = "Test User",
): Promise<string> {
  const signUpRes = await SELF.fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  if (signUpRes.status !== 200) {
    throw new Error(`sign-up failed: ${signUpRes.status}`);
  }
  // メール検証を踏まずに検証済みへ更新する（テスト専用の近道）。
  await env.DB.prepare("UPDATE user SET email_verified = 1 WHERE email = ?").bind(email).run();
  return signInAndGetCookie(email, password);
}

// 既存ユーザーでサインインしてセッションクッキーを取得するテストヘルパー。
// 同一ユーザーの 2 つめのセッション（別端末相当）を作る用途などに使う。
export async function signInAndGetCookie(
  email: string,
  password = "password1234",
): Promise<string> {
  const res = await SELF.fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) {
    throw new Error(`sign-in failed: ${res.status}`);
  }
  return cookieHeaderFrom(res, "sign-in");
}

// 指定メールのユーザー id を D1 から取得する。
export async function getUserId(db: D1Database, email: string): Promise<string> {
  const row = await db
    .prepare("SELECT id FROM user WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (!row) {
    throw new Error(`user not found: ${email}`);
  }
  return row.id;
}
