import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { getUserId, signUpAndGetCookie } from "../helpers/auth-session";

const BASE = env.BETTER_AUTH_URL;

async function createGroup(cookie: string, name = "旅行"): Promise<string> {
  const res = await SELF.fetch(`${BASE}/groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ name }),
  });
  return ((await res.json()) as { id: string }).id;
}

async function issueInvite(cookie: string, groupId: string): Promise<string> {
  const res = await SELF.fetch(`${BASE}/groups/${groupId}/invitations`, {
    method: "POST",
    headers: { cookie },
  });
  return ((await res.json()) as { token: string }).token;
}

describe("招待からの参加フロー", () => {
  it("有効な招待を別ユーザーがプレビューでき、参加できる", async () => {
    const ownerCookie = await signUpAndGetCookie("join-owner@example.com");
    const groupId = await createGroup(ownerCookie, "京都旅行");
    const token = await issueInvite(ownerCookie, groupId);

    const inviteeCookie = await signUpAndGetCookie("join-invitee@example.com");
    const inviteeId = await getUserId(env.DB, "join-invitee@example.com");

    // プレビュー
    const preview = await SELF.fetch(`${BASE}/invitations/${token}`, {
      headers: { cookie: inviteeCookie },
    });
    expect(preview.status).toBe(200);
    expect(await preview.json()).toEqual({
      valid: true,
      groupId,
      groupName: "京都旅行",
      alreadyMember: false,
    });

    // 参加
    const accept = await SELF.fetch(`${BASE}/invitations/${token}/accept`, {
      method: "POST",
      headers: { cookie: inviteeCookie },
    });
    expect(accept.status).toBe(200);
    expect(await accept.json()).toEqual({ groupId });

    // member ロールで参加している
    const row = await env.DB.prepare(
      "SELECT role FROM group_member WHERE group_id = ? AND user_id = ?",
    )
      .bind(groupId, inviteeId)
      .first<{ role: string }>();
    expect(row?.role).toBe("member");
  });

  it("既にメンバーなら二重参加にならず、プレビューは alreadyMember を返す", async () => {
    const ownerCookie = await signUpAndGetCookie("join-dup-owner@example.com");
    const groupId = await createGroup(ownerCookie);
    const token = await issueInvite(ownerCookie, groupId);

    const inviteeCookie = await signUpAndGetCookie("join-dup@example.com");
    const inviteeId = await getUserId(env.DB, "join-dup@example.com");

    await SELF.fetch(`${BASE}/invitations/${token}/accept`, {
      method: "POST",
      headers: { cookie: inviteeCookie },
    });
    // 2 回目
    const second = await SELF.fetch(`${BASE}/invitations/${token}/accept`, {
      method: "POST",
      headers: { cookie: inviteeCookie },
    });
    expect(second.status).toBe(200);

    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS c FROM group_member WHERE group_id = ? AND user_id = ?",
    )
      .bind(groupId, inviteeId)
      .first<{ c: number }>();
    expect(count?.c).toBe(1);

    const preview = await SELF.fetch(`${BASE}/invitations/${token}`, {
      headers: { cookie: inviteeCookie },
    });
    expect(await preview.json()).toMatchObject({ valid: true, alreadyMember: true });
  });

  it("失効した招待は参加できず（410）、プレビューは valid: false", async () => {
    const ownerCookie = await signUpAndGetCookie("join-revoked-owner@example.com");
    const groupId = await createGroup(ownerCookie);
    const token = await issueInvite(ownerCookie, groupId);
    await SELF.fetch(`${BASE}/groups/${groupId}/invitations/${token}`, {
      method: "DELETE",
      headers: { cookie: ownerCookie },
    });

    const inviteeCookie = await signUpAndGetCookie("join-revoked@example.com");

    const preview = await SELF.fetch(`${BASE}/invitations/${token}`, {
      headers: { cookie: inviteeCookie },
    });
    expect(await preview.json()).toEqual({ valid: false });

    const accept = await SELF.fetch(`${BASE}/invitations/${token}/accept`, {
      method: "POST",
      headers: { cookie: inviteeCookie },
    });
    expect(accept.status).toBe(410);
  });

  it("未ログインのプレビュー・参加は 401", async () => {
    const ownerCookie = await signUpAndGetCookie("join-401-owner@example.com");
    const groupId = await createGroup(ownerCookie);
    const token = await issueInvite(ownerCookie, groupId);

    const preview = await SELF.fetch(`${BASE}/invitations/${token}`);
    expect(preview.status).toBe(401);

    const accept = await SELF.fetch(`${BASE}/invitations/${token}/accept`, { method: "POST" });
    expect(accept.status).toBe(401);
  });
});
