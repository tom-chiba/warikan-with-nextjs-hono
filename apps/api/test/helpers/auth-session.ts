import { env, SELF } from "cloudflare:test";

// API のオリジン。テスト環境では vitest.config.ts の miniflare bindings で
// BETTER_AUTH_URL を注入しているため、それを単一ソースとして利用する。
const BASE = env.BETTER_AUTH_URL;

// サインアップしてセッションクッキーを取得するテストヘルパー。
// Better Auth はサインアップ成功時に Set-Cookie でセッションを発行するため、
// その Cookie ヘッダ値をそのまま後続リクエストの `cookie` ヘッダに使う。
export async function signUpAndGetCookie(
  email: string,
  password = "password1234",
  name = "Test User",
): Promise<string> {
  const res = await SELF.fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  if (res.status !== 200) {
    throw new Error(`sign-up failed: ${res.status}`);
  }
  // 複数の Set-Cookie（将来 CSRF 等が増えても）を取りこぼさないよう getSetCookie() を使う。
  // 各 Cookie の属性(Path 等)を除いた name=value 部分だけを連結して cookie ヘッダ値にする。
  const cookies = res.headers.getSetCookie();
  if (cookies.length === 0) {
    throw new Error("sign-up did not return a session cookie");
  }
  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
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
