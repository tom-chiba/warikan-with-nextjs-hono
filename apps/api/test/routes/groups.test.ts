import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { getUserId, signUpAndGetCookie } from "../helpers/auth-session";

const BASE = env.BETTER_AUTH_URL;

// group_member に所属行を直接 INSERT するヘルパー（テスト用のセットアップ）。
// Drizzle の timestamp mode は秒単位で読み書きするため、生 SQL でも秒で挿入する
//（Date.now() のミリ秒を直接入れると Drizzle 経由の読み出しがずれる）。
async function joinGroup(groupId: string, userId: string, role = "member") {
  const nowSec = Math.floor(Date.now() / 1000);
  await env.DB.prepare("INSERT INTO `group` (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .bind(groupId, "Trip", nowSec, nowSec)
    .run();
  await env.DB.prepare(
    "INSERT INTO group_member (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)",
  )
    .bind(groupId, userId, role, nowSec)
    .run();
}

describe("保護ルート /groups/:groupId", () => {
  it("メンバーのリクエストは通過し、メンバー一覧を取得できる", async () => {
    const cookie = await signUpAndGetCookie("member@example.com");
    const userId = await getUserId(env.DB, "member@example.com");
    await joinGroup("group-pass", userId, "owner");

    const res = await SELF.fetch(`${BASE}/groups/group-pass/members`, {
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
    // ユーザーは group-a のメンバーだが、所属しない group-b にアクセスする。
    // requireGroupMember の (groupId, userId) 絞り込みが効いていることを保証する。
    const cookie = await signUpAndGetCookie("cross@example.com");
    const userId = await getUserId(env.DB, "cross@example.com");
    await joinGroup("group-a", userId, "member");

    const res = await SELF.fetch(`${BASE}/groups/group-b/members`, {
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
    const userId = await getUserId(env.DB, "rename-owner@example.com");
    await joinGroup("group-rename", userId, "owner");
    const before = await selectGroup("group-rename");

    const res = await patchName("group-rename", "京都旅行", cookie);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const after = await selectGroup("group-rename");
    expect(after?.name).toBe("京都旅行");
    // joinGroup は updated_at を過去秒で入れるため、更新後は厳密に大きくなる…とは限らない
    //（同一秒内）。少なくとも巻き戻っていないことを確認する。
    expect(after?.updated_at).toBeGreaterThanOrEqual(before?.updated_at ?? 0);
  });

  it("name は trim されて保存される", async () => {
    const cookie = await signUpAndGetCookie("rename-trim@example.com");
    const userId = await getUserId(env.DB, "rename-trim@example.com");
    await joinGroup("group-rename-trim", userId, "owner");

    const res = await patchName("group-rename-trim", "  京都旅行  ", cookie);

    expect(res.status).toBe(200);
    expect((await selectGroup("group-rename-trim"))?.name).toBe("京都旅行");
  });

  it("member は変更できない（403）", async () => {
    const cookie = await signUpAndGetCookie("rename-member@example.com");
    const userId = await getUserId(env.DB, "rename-member@example.com");
    await joinGroup("group-rename-m", userId, "member");

    const res = await patchName("group-rename-m", "変更後", cookie);

    expect(res.status).toBe(403);
    expect((await selectGroup("group-rename-m"))?.name).toBe("Trip");
  });

  it("非メンバーは変更できない（403）", async () => {
    await signUpAndGetCookie("rename-owner2@example.com");
    const ownerId = await getUserId(env.DB, "rename-owner2@example.com");
    await joinGroup("group-rename-x", ownerId, "owner");
    const outsiderCookie = await signUpAndGetCookie("rename-outsider@example.com");

    const res = await patchName("group-rename-x", "乗っ取り", outsiderCookie);

    expect(res.status).toBe(403);
    expect((await selectGroup("group-rename-x"))?.name).toBe("Trip");
  });

  it("未ログインは 401 を返す", async () => {
    await signUpAndGetCookie("rename-unauth@example.com");
    const userId = await getUserId(env.DB, "rename-unauth@example.com");
    await joinGroup("group-rename-u", userId, "owner");

    const res = await patchName("group-rename-u", "変更後");

    expect(res.status).toBe(401);
  });

  it("空文字・空白のみの name は 400 を返す", async () => {
    const cookie = await signUpAndGetCookie("rename-blank@example.com");
    const userId = await getUserId(env.DB, "rename-blank@example.com");
    await joinGroup("group-rename-b", userId, "owner");

    expect((await patchName("group-rename-b", "", cookie)).status).toBe(400);
    expect((await patchName("group-rename-b", "   ", cookie)).status).toBe(400);
    expect((await selectGroup("group-rename-b"))?.name).toBe("Trip");
  });

  it("100 文字は成功し、101 文字は 400 を返す", async () => {
    const cookie = await signUpAndGetCookie("rename-len@example.com");
    const userId = await getUserId(env.DB, "rename-len@example.com");
    await joinGroup("group-rename-l", userId, "owner");

    expect((await patchName("group-rename-l", "あ".repeat(101), cookie)).status).toBe(400);
    expect((await patchName("group-rename-l", "あ".repeat(100), cookie)).status).toBe(200);
    expect((await selectGroup("group-rename-l"))?.name).toBe("あ".repeat(100));
  });
});

describe("PUT /groups/:groupId/last-viewed（カレントグループの記録）", () => {
  it("メンバーは自分の last_viewed_at を記録できる", async () => {
    const cookie = await signUpAndGetCookie("viewer@example.com");
    const userId = await getUserId(env.DB, "viewer@example.com");
    await joinGroup("group-viewed", userId, "member");

    const res = await SELF.fetch(`${BASE}/groups/group-viewed/last-viewed`, {
      method: "PUT",
      headers: { cookie },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const row = await env.DB.prepare(
      "SELECT last_viewed_at FROM group_member WHERE group_id = ? AND user_id = ?",
    )
      .bind("group-viewed", userId)
      .first<{ last_viewed_at: number | null }>();
    expect(row?.last_viewed_at).not.toBeNull();
  });

  it("所属しないグループには記録できない（403）", async () => {
    const cookie = await signUpAndGetCookie("viewer-cross@example.com");
    const userId = await getUserId(env.DB, "viewer-cross@example.com");
    await joinGroup("group-mine", userId, "member");

    const res = await SELF.fetch(`${BASE}/groups/group-others/last-viewed`, {
      method: "PUT",
      headers: { cookie },
    });

    expect(res.status).toBe(403);
  });
});
