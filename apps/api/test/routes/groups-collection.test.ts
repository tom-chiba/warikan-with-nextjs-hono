import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { getUserId, signUpAndGetCookie } from "../helpers/auth-session";

const BASE = env.BETTER_AUTH_URL;

describe("POST /groups（グループ作成）", () => {
  it("ログインユーザーがグループを作成でき、作成者が owner になる", async () => {
    const cookie = await signUpAndGetCookie("creator@example.com");
    const userId = await getUserId(env.DB, "creator@example.com");

    const res = await SELF.fetch(`${BASE}/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ name: "京都旅行" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; name: string };
    expect(body.name).toBe("京都旅行");
    expect(body.id).toBeTruthy();

    // 作成者が当該グループの owner として登録されていること。
    const member = await env.DB.prepare(
      "SELECT role FROM group_member WHERE group_id = ? AND user_id = ?",
    )
      .bind(body.id, userId)
      .first<{ role: string }>();
    expect(member?.role).toBe("owner");

    // group 行も作成されていること。
    const group = await env.DB.prepare("SELECT name FROM `group` WHERE id = ?")
      .bind(body.id)
      .first<{ name: string }>();
    expect(group?.name).toBe("京都旅行");
  });

  it("未ログインなら 401 を返し、グループは作成されない", async () => {
    const res = await SELF.fetch(`${BASE}/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "未ログイン" }),
    });

    expect(res.status).toBe(401);
    const count = await env.DB.prepare("SELECT COUNT(*) AS c FROM `group` WHERE name = ?")
      .bind("未ログイン")
      .first<{ c: number }>();
    expect(count?.c).toBe(0);
  });

  it("空白のみの name は 400（バリデーションエラー）", async () => {
    const cookie = await signUpAndGetCookie("validate@example.com");

    const res = await SELF.fetch(`${BASE}/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ name: "   " }),
    });

    expect(res.status).toBe(400);
  });
});
