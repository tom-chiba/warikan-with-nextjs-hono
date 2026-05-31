import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { signUpAndGetCookie } from "../helpers/auth-session";

const BASE = env.BETTER_AUTH_URL;

// API 経由でグループを作成し（作成者が owner メンバーになる）、id を返す。
async function createGroup(cookie: string, name = "旅行"): Promise<string> {
  const res = await SELF.fetch(`${BASE}/groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ name }),
  });
  return ((await res.json()) as { id: string }).id;
}

function issueInvite(cookie: string, groupId: string) {
  return SELF.fetch(`${BASE}/groups/${groupId}/invitations`, {
    method: "POST",
    headers: { cookie },
  });
}

describe("グループ招待リンク", () => {
  it("メンバーは招待リンクを発行でき、推測困難なトークンと約7日後の期限が返る", async () => {
    const cookie = await signUpAndGetCookie("inviter@example.com");
    const groupId = await createGroup(cookie);

    const res = await issueInvite(cookie, groupId);

    expect(res.status).toBe(201);
    const body = (await res.json()) as { token: string; expiresAt: string };
    expect(body.token.length).toBeGreaterThanOrEqual(40);

    const ttlMs = new Date(body.expiresAt).getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
    expect(ttlMs).toBeLessThan(8 * 24 * 60 * 60 * 1000);

    // DB に当該グループの未失効トークンとして保存されている。
    const row = await env.DB.prepare(
      "SELECT group_id, revoked_at FROM group_invitation WHERE token = ?",
    )
      .bind(body.token)
      .first<{ group_id: string; revoked_at: number | null }>();
    expect(row?.group_id).toBe(groupId);
    expect(row?.revoked_at).toBeNull();
  });

  it("再発行すると以前の有効トークンは失効し、active は最新の 1 本だけになる", async () => {
    const cookie = await signUpAndGetCookie("reissue@example.com");
    const groupId = await createGroup(cookie);

    const first = (await (await issueInvite(cookie, groupId)).json()) as { token: string };
    const second = (await (await issueInvite(cookie, groupId)).json()) as { token: string };
    expect(second.token).not.toBe(first.token);

    const firstRow = await env.DB.prepare("SELECT revoked_at FROM group_invitation WHERE token = ?")
      .bind(first.token)
      .first<{ revoked_at: number | null }>();
    expect(firstRow?.revoked_at).not.toBeNull();

    const active = await SELF.fetch(`${BASE}/groups/${groupId}/invitations/active`, {
      headers: { cookie },
    });
    const { invitation } = (await active.json()) as { invitation: { token: string } | null };
    expect(invitation?.token).toBe(second.token);
  });

  it("無効化すると有効な招待は無くなる（active が null）", async () => {
    const cookie = await signUpAndGetCookie("revoke@example.com");
    const groupId = await createGroup(cookie);
    const { token } = (await (await issueInvite(cookie, groupId)).json()) as { token: string };

    const del = await SELF.fetch(`${BASE}/groups/${groupId}/invitations/${token}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(del.status).toBe(200);

    const active = await SELF.fetch(`${BASE}/groups/${groupId}/invitations/active`, {
      headers: { cookie },
    });
    expect(await active.json()).toEqual({ invitation: null });
  });

  it("存在しないトークンの無効化は 404", async () => {
    const cookie = await signUpAndGetCookie("revoke404@example.com");
    const groupId = await createGroup(cookie);

    const del = await SELF.fetch(`${BASE}/groups/${groupId}/invitations/does-not-exist`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(del.status).toBe(404);
  });

  it("所属しないグループへの招待発行は 403", async () => {
    const ownerCookie = await signUpAndGetCookie("owner-inv@example.com");
    const groupId = await createGroup(ownerCookie);
    const outsiderCookie = await signUpAndGetCookie("outsider-inv@example.com");

    const res = await issueInvite(outsiderCookie, groupId);
    expect(res.status).toBe(403);
  });

  it("未ログインの招待発行は 401", async () => {
    const ownerCookie = await signUpAndGetCookie("owner-inv2@example.com");
    const groupId = await createGroup(ownerCookie);

    const res = await SELF.fetch(`${BASE}/groups/${groupId}/invitations`, { method: "POST" });
    expect(res.status).toBe(401);
  });
});
