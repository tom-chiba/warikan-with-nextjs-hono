import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// API のオリジンは vitest.config.ts の miniflare bindings(BETTER_AUTH_URL) を単一ソースとする。
const BASE = env.BETTER_AUTH_URL;

describe("RPC ルート", () => {
  it("GET / は API メッセージを返す", async () => {
    const res = await SELF.fetch(`${BASE}/`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "warikan API" });
  });

  it("GET /hello はクエリの name を反映する", async () => {
    const res = await SELF.fetch(`${BASE}/hello?name=chiba`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "Hello, chiba!" });
  });
});

describe("認証 (Better Auth + D1)", () => {
  it("メールサインアップでユーザーが作成され D1 に永続化される", async () => {
    const res = await SELF.fetch(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test User",
        email: "test@example.com",
        password: "password1234",
      }),
    });
    expect(res.status).toBe(200);

    const row = await env.DB.prepare("SELECT email FROM user WHERE email = ?")
      .bind("test@example.com")
      .first<{ email: string }>();
    expect(row?.email).toBe("test@example.com");
  });

  it("誤ったパスワードのサインインは 401 を返す", async () => {
    await SELF.fetch(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Another",
        email: "another@example.com",
        password: "password1234",
      }),
    });

    const res = await SELF.fetch(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "another@example.com",
        password: "wrong-password",
      }),
    });
    expect(res.status).toBe(401);
  });
});
