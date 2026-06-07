import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { getUserId, signUpAndGetCookie } from "../helpers/auth-session";
import { addMember, createGroup } from "../helpers/group";

const BASE = env.BETTER_AUTH_URL;

describe("保護ルート /groups/:groupId", () => {
  it("メンバーのリクエストは通過し、メンバー一覧を取得できる", async () => {
    const cookie = await signUpAndGetCookie("member@example.com");
    const userId = await getUserId(env.DB, "member@example.com");
    const groupId = await createGroup(cookie);

    const res = await SELF.fetch(`${BASE}/groups/${groupId}/members`, {
      headers: { cookie },
    });

    expect(res.status).toBe(200);
    const { members } = (await res.json()) as {
      members: { userId: string; email: string; role: string }[];
    };
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      userId,
      email: "member@example.com",
      role: "owner",
    });
  });

  it("別グループのメンバーが所属しないグループにアクセスすると 403 を返す", async () => {
    // ユーザーは自分のグループのメンバーだが、所属しない他人のグループにアクセスする。
    // requireGroupMember の (groupId, userId) 絞り込みが効いていることを保証する。
    const cookie = await signUpAndGetCookie("cross@example.com");
    await createGroup(cookie);
    const otherCookie = await signUpAndGetCookie("cross-other@example.com");
    const otherGroupId = await createGroup(otherCookie);

    const res = await SELF.fetch(`${BASE}/groups/${otherGroupId}/members`, {
      headers: { cookie },
    });

    expect(res.status).toBe(403);
  });
});

describe("PATCH /groups/:groupId（グループ名の変更）", () => {
  async function patchName(groupId: string, name: unknown, cookie?: string) {
    return SELF.fetch(`${BASE}/groups/${groupId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ name }),
    });
  }

  async function selectGroup(groupId: string) {
    return env.DB.prepare("SELECT name, updated_at FROM `group` WHERE id = ?")
      .bind(groupId)
      .first<{ name: string; updated_at: number }>();
  }

  it("owner はグループ名を変更でき、updated_at も更新される", async () => {
    const cookie = await signUpAndGetCookie("rename-owner@example.com");
    const groupId = await createGroup(cookie);
    const before = await selectGroup(groupId);

    const res = await patchName(groupId, "京都旅行", cookie);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const after = await selectGroup(groupId);
    expect(after?.name).toBe("京都旅行");
    // 作成と変更が同一秒に収まることがあるため、巻き戻っていないことを確認する。
    expect(after?.updated_at).toBeGreaterThanOrEqual(before?.updated_at ?? 0);
  });

  it("name は trim されて保存される", async () => {
    const cookie = await signUpAndGetCookie("rename-trim@example.com");
    const groupId = await createGroup(cookie);

    const res = await patchName(groupId, "  京都旅行  ", cookie);

    expect(res.status).toBe(200);
    expect((await selectGroup(groupId))?.name).toBe("京都旅行");
  });

  it("member は変更できない（403）", async () => {
    const ownerCookie = await signUpAndGetCookie("rename-owner2@example.com");
    const groupId = await createGroup(ownerCookie);
    const memberCookie = await signUpAndGetCookie("rename-member@example.com");
    const memberId = await getUserId(env.DB, "rename-member@example.com");
    await addMember(groupId, memberId);

    const res = await patchName(groupId, "変更後", memberCookie);

    expect(res.status).toBe(403);
    expect((await selectGroup(groupId))?.name).toBe("旅行");
  });

  it("非メンバーは変更できない（403）", async () => {
    const ownerCookie = await signUpAndGetCookie("rename-owner3@example.com");
    const groupId = await createGroup(ownerCookie);
    const outsiderCookie = await signUpAndGetCookie("rename-outsider@example.com");

    const res = await patchName(groupId, "乗っ取り", outsiderCookie);

    expect(res.status).toBe(403);
    expect((await selectGroup(groupId))?.name).toBe("旅行");
  });

  it("未ログインは 401 を返す", async () => {
    const cookie = await signUpAndGetCookie("rename-unauth@example.com");
    const groupId = await createGroup(cookie);

    const res = await patchName(groupId, "変更後");

    expect(res.status).toBe(401);
  });

  it("空文字・空白のみの name は 400 を返す", async () => {
    const cookie = await signUpAndGetCookie("rename-blank@example.com");
    const groupId = await createGroup(cookie);

    expect((await patchName(groupId, "", cookie)).status).toBe(400);
    expect((await patchName(groupId, "   ", cookie)).status).toBe(400);
    expect((await selectGroup(groupId))?.name).toBe("旅行");
  });

  it("100 文字は成功し、101 文字は 400 を返す", async () => {
    const cookie = await signUpAndGetCookie("rename-len@example.com");
    const groupId = await createGroup(cookie);

    expect((await patchName(groupId, "あ".repeat(101), cookie)).status).toBe(400);
    expect((await patchName(groupId, "あ".repeat(100), cookie)).status).toBe(200);
    expect((await selectGroup(groupId))?.name).toBe("あ".repeat(100));
  });
});

describe("PUT /groups/:groupId/last-viewed（カレントグループの記録）", () => {
  it("メンバーは自分の last_viewed_at を記録できる", async () => {
    const ownerCookie = await signUpAndGetCookie("viewer-owner@example.com");
    const groupId = await createGroup(ownerCookie);
    const memberCookie = await signUpAndGetCookie("viewer@example.com");
    const memberId = await getUserId(env.DB, "viewer@example.com");
    await addMember(groupId, memberId);

    const res = await SELF.fetch(`${BASE}/groups/${groupId}/last-viewed`, {
      method: "PUT",
      headers: { cookie: memberCookie },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const row = await env.DB.prepare(
      "SELECT last_viewed_at FROM group_member WHERE group_id = ? AND user_id = ?",
    )
      .bind(groupId, memberId)
      .first<{ last_viewed_at: number | null }>();
    expect(row?.last_viewed_at).not.toBeNull();
  });

  it("所属しないグループには記録できない（403）", async () => {
    const cookie = await signUpAndGetCookie("viewer-cross@example.com");
    await createGroup(cookie);
    const otherCookie = await signUpAndGetCookie("viewer-other@example.com");
    const otherGroupId = await createGroup(otherCookie);

    const res = await SELF.fetch(`${BASE}/groups/${otherGroupId}/last-viewed`, {
      method: "PUT",
      headers: { cookie },
    });

    expect(res.status).toBe(403);
  });
});
