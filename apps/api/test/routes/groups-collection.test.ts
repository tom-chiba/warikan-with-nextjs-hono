import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createDb } from "../../src/db";
import { group, groupMember } from "../../src/db/schema";
import { getUserId, signUpAndGetCookie } from "../helpers/auth-session";
import { createGroup } from "../helpers/group";

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

  // 作成は group と group_member を db.batch() で原子的に挿入する。member 挿入が失敗した場合に
  // group 行だけが残る（オーナー不在のゴミグループ）ことがないよう、batch の all-or-nothing を検証する。
  // ハンドラ経由では常に有効な userId が入り member 挿入を失敗させられないため、ここでは
  // batch のロールバック保証そのものを FK 違反（存在しない userId）で直接確認する。
  it("group/member 挿入は原子的で、member 挿入失敗時は group 行も残らない", async () => {
    const db = createDb(env.DB);
    const id = crypto.randomUUID();

    await expect(
      db.batch([
        db.insert(group).values({ id, name: "ロールバック検証" }),
        db.insert(groupMember).values({ groupId: id, userId: "missing-user", role: "owner" }),
      ]),
    ).rejects.toThrow();

    const row = await env.DB.prepare("SELECT id FROM `group` WHERE id = ?")
      .bind(id)
      .first<{ id: string }>();
    expect(row).toBeNull();
  });
});

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
    expect(await res.json()).toEqual({ groups: [], currentGroupId: null });
  });

  it("未ログインなら 401", async () => {
    const res = await SELF.fetch(`${BASE}/groups`);
    expect(res.status).toBe(401);
  });

  // カレントグループ（#51）: last_viewed_at が最大のグループを currentGroupId として同梱する。
  it("どのグループも開いていなければ currentGroupId は null", async () => {
    const cookie = await signUpAndGetCookie("no-current@example.com");
    await createGroup(cookie, "旅行");

    const res = await SELF.fetch(`${BASE}/groups`, { headers: { cookie } });

    const body = (await res.json()) as { currentGroupId: string | null };
    expect(body.currentGroupId).toBeNull();
  });

  it("last-viewed を記録すると、そのグループが currentGroupId として返る", async () => {
    const cookie = await signUpAndGetCookie("current@example.com");
    const g1 = await createGroup(cookie, "旅行");
    const g2 = await createGroup(cookie, "飲み会");

    // g1 → g2 の順で開くと、後から開いた g2 がカレントになる。
    const putRes = await SELF.fetch(`${BASE}/groups/${g1}/last-viewed`, {
      method: "PUT",
      headers: { cookie },
    });
    expect(putRes.status).toBe(200);
    await SELF.fetch(`${BASE}/groups/${g2}/last-viewed`, { method: "PUT", headers: { cookie } });
    // ミリ秒精度でもテスト実行が同一ミリ秒に収まる可能性はゼロではないため、
    // g2 を明示的に未来へずらして「後から開いた方が勝つ」状態を決定的に作る。
    await env.DB.prepare(
      "UPDATE group_member SET last_viewed_at = last_viewed_at + 10 WHERE group_id = ?",
    )
      .bind(g2)
      .run();

    const res = await SELF.fetch(`${BASE}/groups`, { headers: { cookie } });

    const body = (await res.json()) as { currentGroupId: string | null };
    expect(body.currentGroupId).toBe(g2);
  });
});
