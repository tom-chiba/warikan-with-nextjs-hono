import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { signUpAndGetCookie } from "../helpers/auth-session";

const BASE = env.BETTER_AUTH_URL;

// ブラウザが付与する Origin ヘッダ。Better Auth は cookie 付き POST に origin/referer が
// 無いと CSRF として 403 を返すため、実際のクライアントと同様に origin を明示する。
const WEB_ORIGIN = env.WEB_ORIGIN.split(",")[0];

// Better Auth のメールアドレス変更エンドポイント（#61）。
function changeEmail(cookie: string, newEmail: string) {
  return SELF.fetch(`${BASE}/api/auth/change-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie, origin: WEB_ORIGIN },
    body: JSON.stringify({ newEmail }),
  });
}

// メール変更後にそのメールでサインインできるかの確認用。
function signIn(email: string, password = "password1234") {
  return SELF.fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

async function getDbEmail(originalOrNewEmail: string): Promise<string | null> {
  const row = await env.DB.prepare("SELECT email FROM user WHERE email = ?")
    .bind(originalOrNewEmail)
    .first<{ email: string }>();
  return row?.email ?? null;
}

describe("POST /api/auth/change-email（メールアドレス変更）", () => {
  it("新しいメールアドレスに変更でき、変更後のメールでサインインできる", async () => {
    const cookie = await signUpAndGetCookie("ce-basic@example.com");

    const res = await changeEmail(cookie, "ce-basic-new@example.com");

    expect(res.status).toBe(200);
    expect(await getDbEmail("ce-basic-new@example.com")).toBe("ce-basic-new@example.com");
    expect(await getDbEmail("ce-basic@example.com")).toBeNull();
    const signInRes = await signIn("ce-basic-new@example.com");
    expect(signInRes.status).toBe(200);
  });

  it("変更後も既存セッションが維持される（同じ cookie で新メールのセッションが取れる）", async () => {
    const cookie = await signUpAndGetCookie("ce-session@example.com");

    const res = await changeEmail(cookie, "ce-session-new@example.com");
    expect(res.status).toBe(200);

    const sessionRes = await SELF.fetch(`${BASE}/api/auth/get-session`, {
      headers: { cookie },
    });
    expect(sessionRes.status).toBe(200);
    const session = await sessionRes.json<{ user: { email: string } } | null>();
    expect(session?.user.email).toBe("ce-session-new@example.com");
  });

  it("大文字を含む入力は小文字に正規化して保存される", async () => {
    const cookie = await signUpAndGetCookie("ce-case@example.com");

    const res = await changeEmail(cookie, "CE-Case-New@Example.com");

    expect(res.status).toBe(200);
    expect(await getDbEmail("ce-case-new@example.com")).toBe("ce-case-new@example.com");
  });

  // Better Auth は既存メールとの重複を黙って成功（{ status: true }）で返すため、
  // hooks.before の重複チェックが 400 + 日本語メッセージを返すことを確認する。
  it("既存ユーザーのメールアドレスへは変更できない（400）", async () => {
    await signUpAndGetCookie("ce-taken@example.com");
    const cookie = await signUpAndGetCookie("ce-dup@example.com");

    const res = await changeEmail(cookie, "ce-taken@example.com");

    expect(res.status).toBe(400);
    const body = await res.json<{ message?: string }>();
    expect(body.message).toBe("このメールアドレスはすでに使用されています");
    // 変更されていないこと。
    expect(await getDbEmail("ce-dup@example.com")).toBe("ce-dup@example.com");
  });

  it("大文字小文字違いの既存メールも重複として弾く", async () => {
    await signUpAndGetCookie("ce-taken-case@example.com");
    const cookie = await signUpAndGetCookie("ce-dup-case@example.com");

    const res = await changeEmail(cookie, "CE-TAKEN-CASE@example.com");

    expect(res.status).toBe(400);
  });

  it("不正な形式のメールアドレスへは変更できない（400）", async () => {
    const cookie = await signUpAndGetCookie("ce-invalid@example.com");

    const res = await changeEmail(cookie, "not-an-email");

    expect(res.status).toBe(400);
    expect(await getDbEmail("ce-invalid@example.com")).toBe("ce-invalid@example.com");
  });

  it("現在のメールアドレスと同じ値へは「重複」ではなく「変更なし」のエラーになる（400）", async () => {
    const cookie = await signUpAndGetCookie("ce-same@example.com");

    const res = await changeEmail(cookie, "ce-same@example.com");

    expect(res.status).toBe(400);
    // hooks.before の重複チェックはスキップされ、Better Auth 本体のエラーが返る。
    const body = await res.json<{ message?: string }>();
    expect(body.message).toBe("Email is the same");
  });

  it("未ログインでは変更できない（401）", async () => {
    const res = await SELF.fetch(`${BASE}/api/auth/change-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newEmail: "ce-anon@example.com" }),
    });
    expect(res.status).toBe(401);
  });

  // hooks.before はエンドポイント本体の認証より先に走るため、未認証でも重複チェックが
  // 動くと 400/401 のステータス差でメールの存在有無が列挙できてしまう。
  // セッションが無い場合はチェックをスキップし、常に 401 になることを確認する。
  it("未ログインでは既存メールを指定しても存在有無が漏れない（401）", async () => {
    await signUpAndGetCookie("ce-enum@example.com");

    const res = await SELF.fetch(`${BASE}/api/auth/change-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newEmail: "ce-enum@example.com" }),
    });

    expect(res.status).toBe(401);
  });
});
