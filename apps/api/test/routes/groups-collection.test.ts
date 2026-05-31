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

// API 経由でグループを作成して id を返すヘルパー。
async function createGroup(cookie: string, name: string): Promise<string> {
  const res = await SELF.fetch(`${BASE}/groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ name }),
  });
  const body = (await res.json()) as { id: string };
  return body.id;
}

describe("GET /groups（所属グループ一覧）", () => {
  it("自分が所属するグループだけを role 付きで返す", async () => {
    const meCookie = await signUpAndGetCookie("owner-list@example.com");
    const otherCookie = await signUpAndGetCookie("other-list@example.com");

    const g1 = await createGroup(meCookie, "旅行");
    const g2 = await createGroup(meCookie, "飲み会");
    await createGroup(otherCookie, "他人のグループ");

    const res = await SELF.fetch(`${BASE}/groups`, { headers: { cookie: meCookie } });

    expect(res.status).toBe(200);
    const { groups } = (await res.json()) as {
      groups: { id: string; name: string; role: string }[];
    };

    // 自分のグループ 2 件のみ。他人のグループは含まれない。
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.id).sort()).toEqual([g1, g2].sort());
    expect(groups.every((g) => g.role === "owner")).toBe(true);
    expect(groups.map((g) => g.name)).not.toContain("他人のグループ");
  });

  it("所属が 0 件なら空配列を返す", async () => {
    const cookie = await signUpAndGetCookie("empty-list@example.com");

    const res = await SELF.fetch(`${BASE}/groups`, { headers: { cookie } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ groups: [] });
  });

  it("未ログインなら 401", async () => {
    const res = await SELF.fetch(`${BASE}/groups`);
    expect(res.status).toBe(401);
  });
});
