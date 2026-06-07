import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { getUserId, signUpAndGetCookie } from "../helpers/auth-session";
import { addMember, createGroup } from "../helpers/group";

const BASE = env.BETTER_AUTH_URL;

function deleteMember(cookie: string, groupId: string, userId: string) {
  return SELF.fetch(`${BASE}/groups/${groupId}/members/${userId}`, {
    method: "DELETE",
    headers: { cookie },
  });
}

function putDisplayName(cookie: string, groupId: string, body: unknown) {
  return SELF.fetch(`${BASE}/groups/${groupId}/members/me/display-name`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

type MemberView = { userId: string; name: string; displayName: string | null };

async function getMembers(cookie: string, groupId: string): Promise<MemberView[]> {
  const res = await SELF.fetch(`${BASE}/groups/${groupId}/members`, { headers: { cookie } });
  expect(res.status).toBe(200);
  return ((await res.json()) as { members: MemberView[] }).members;
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

  it("グループ削除時に関連する招待リンクも CASCADE で消える", async () => {
    const ownerCookie = await signUpAndGetCookie("mm-cascade@example.com");
    const groupId = await createGroup(ownerCookie);
    const ownerId = await getUserId(env.DB, "mm-cascade@example.com");
    // 招待リンクを 1 本発行しておき、グループ削除で子レコードが残らないことを確認する。
    const issued = await SELF.fetch(`${BASE}/groups/${groupId}/invitations`, {
      method: "POST",
      headers: { cookie: ownerCookie },
    });
    expect(issued.status).toBe(201);

    const res = await deleteMember(ownerCookie, groupId, ownerId);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ removed: true, groupDeleted: true });
    const invitation = await env.DB.prepare("SELECT token FROM group_invitation WHERE group_id = ?")
      .bind(groupId)
      .first();
    expect(invitation).toBeNull();
  });

  it("存在しないメンバーの削除は 404", async () => {
    const ownerCookie = await signUpAndGetCookie("mm-404@example.com");
    const groupId = await createGroup(ownerCookie);

    const res = await deleteMember(ownerCookie, groupId, "no-such-user");

    expect(res.status).toBe(404);
  });
});

describe("PUT /groups/:groupId/members/me/display-name（表示名の設定・変更）", () => {
  it("自分の表示名を設定すると一覧の name に反映され、他メンバーからも見える", async () => {
    const ownerCookie = await signUpAndGetCookie("dn-owner@example.com");
    const memberCookie = await signUpAndGetCookie("dn-member@example.com");
    const groupId = await createGroup(ownerCookie);
    const memberId = await getUserId(env.DB, "dn-member@example.com");
    await addMember(groupId, memberId);

    const res = await putDisplayName(memberCookie, groupId, { displayName: "お父さん" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // 設定した本人以外（owner）から見ても表示名に解決されている。
    const members = await getMembers(ownerCookie, groupId);
    const member = members.find((m) => m.userId === memberId);
    expect(member).toMatchObject({ name: "お父さん", displayName: "お父さん" });

    // 未設定のメンバー（owner 自身）は user.name のまま（displayName は null）。
    const owner = members.find((m) => m.userId !== memberId);
    expect(owner).toMatchObject({ name: "Test User", displayName: null });
  });

  it("表示名は変更（上書き）でき、前後の空白は取り除いて保存される", async () => {
    const cookie = await signUpAndGetCookie("dn-update@example.com");
    const groupId = await createGroup(cookie);

    expect((await putDisplayName(cookie, groupId, { displayName: "ニック" })).status).toBe(200);
    expect((await putDisplayName(cookie, groupId, { displayName: "  トム  " })).status).toBe(200);

    const [me] = await getMembers(cookie, groupId);
    expect(me).toMatchObject({ name: "トム", displayName: "トム" });
  });

  it("空文字・空白のみの表示名は 400", async () => {
    const cookie = await signUpAndGetCookie("dn-blank@example.com");
    const groupId = await createGroup(cookie);

    expect((await putDisplayName(cookie, groupId, { displayName: "" })).status).toBe(400);
    expect((await putDisplayName(cookie, groupId, { displayName: "   " })).status).toBe(400);

    // 失敗時は未設定のまま（user.name にフォールバック）。
    const [me] = await getMembers(cookie, groupId);
    expect(me).toMatchObject({ name: "Test User", displayName: null });
  });

  it("100 文字は設定でき、101 文字は 400", async () => {
    const cookie = await signUpAndGetCookie("dn-length@example.com");
    const groupId = await createGroup(cookie);

    expect((await putDisplayName(cookie, groupId, { displayName: "あ".repeat(101) })).status).toBe(
      400,
    );
    expect((await putDisplayName(cookie, groupId, { displayName: "あ".repeat(100) })).status).toBe(
      200,
    );
  });

  it("グループのメンバーでなければ 403", async () => {
    const ownerCookie = await signUpAndGetCookie("dn-owner2@example.com");
    const outsiderCookie = await signUpAndGetCookie("dn-outsider@example.com");
    const groupId = await createGroup(ownerCookie);

    const res = await putDisplayName(outsiderCookie, groupId, { displayName: "侵入者" });

    expect(res.status).toBe(403);
  });

  it("GET /groups の同梱メンバー（currentGroupMembers）にも表示名が反映される", async () => {
    const cookie = await signUpAndGetCookie("dn-seed@example.com");
    const groupId = await createGroup(cookie);
    expect((await putDisplayName(cookie, groupId, { displayName: "母" })).status).toBe(200);

    const res = await SELF.fetch(`${BASE}/groups`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      currentGroupMembers: { groupId: string; members: MemberView[] } | null;
    };
    expect(body.currentGroupMembers?.groupId).toBe(groupId);
    expect(body.currentGroupMembers?.members[0]).toMatchObject({ name: "母", displayName: "母" });
  });
});
