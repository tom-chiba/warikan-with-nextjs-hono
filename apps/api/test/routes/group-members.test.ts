import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { getUserId, signUpAndGetCookie } from "../helpers/auth-session";

const BASE = env.BETTER_AUTH_URL;

// API 経由でグループを作成し（作成者が owner）、id を返す。
async function createGroup(cookie: string, name = "旅行"): Promise<string> {
  const res = await SELF.fetch(`${BASE}/groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ name }),
  });
  return ((await res.json()) as { id: string }).id;
}

// 既存グループに member を直接 INSERT する（参加フロー #12 未実装のためテスト用に直接追加）。
async function addMember(groupId: string, userId: string, role = "member") {
  const nowSec = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT INTO group_member (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)",
  )
    .bind(groupId, userId, role, nowSec)
    .run();
}

function deleteMember(cookie: string, groupId: string, userId: string) {
  return SELF.fetch(`${BASE}/groups/${groupId}/members/${userId}`, {
    method: "DELETE",
    headers: { cookie },
  });
}

async function memberCount(groupId: string): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM group_member WHERE group_id = ?")
    .bind(groupId)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

describe("DELETE /groups/:groupId/members/:userId（削除・退出）", () => {
  it("メンバーは自分を退出でき、他メンバーが残ればグループは残る", async () => {
    const ownerCookie = await signUpAndGetCookie("mm-owner@example.com");
    const memberCookie = await signUpAndGetCookie("mm-member@example.com");
    const groupId = await createGroup(ownerCookie);
    const memberId = await getUserId(env.DB, "mm-member@example.com");
    await addMember(groupId, memberId);

    const res = await deleteMember(memberCookie, groupId, memberId);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ removed: true, groupDeleted: false });
    expect(await memberCount(groupId)).toBe(1);
  });

  it("owner は他メンバーを削除できる", async () => {
    const ownerCookie = await signUpAndGetCookie("mm-owner2@example.com");
    await signUpAndGetCookie("mm-target@example.com");
    const groupId = await createGroup(ownerCookie);
    const targetId = await getUserId(env.DB, "mm-target@example.com");
    await addMember(groupId, targetId);

    const res = await deleteMember(ownerCookie, groupId, targetId);

    expect(res.status).toBe(200);
    expect(await memberCount(groupId)).toBe(1);
  });

  it("member は他メンバーを削除できない（403）", async () => {
    const ownerCookie = await signUpAndGetCookie("mm-owner3@example.com");
    const memberCookie = await signUpAndGetCookie("mm-member3@example.com");
    const groupId = await createGroup(ownerCookie);
    const ownerId = await getUserId(env.DB, "mm-owner3@example.com");
    const memberId = await getUserId(env.DB, "mm-member3@example.com");
    await addMember(groupId, memberId);

    const res = await deleteMember(memberCookie, groupId, ownerId);

    expect(res.status).toBe(403);
    expect(await memberCount(groupId)).toBe(2);
  });

  it("最後の 1 人が退出するとグループも削除される", async () => {
    const ownerCookie = await signUpAndGetCookie("mm-last@example.com");
    const groupId = await createGroup(ownerCookie);
    const ownerId = await getUserId(env.DB, "mm-last@example.com");

    const res = await deleteMember(ownerCookie, groupId, ownerId);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ removed: true, groupDeleted: true });
    const group = await env.DB.prepare("SELECT id FROM `group` WHERE id = ?").bind(groupId).first();
    expect(group).toBeNull();
  });

  it("存在しないメンバーの削除は 404", async () => {
    const ownerCookie = await signUpAndGetCookie("mm-404@example.com");
    const groupId = await createGroup(ownerCookie);

    const res = await deleteMember(ownerCookie, groupId, "no-such-user");

    expect(res.status).toBe(404);
  });
});
