import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { getUserId, signUpAndGetCookie } from "../helpers/auth-session";
import { addMember, createGroup } from "../helpers/group";

const BASE = env.BETTER_AUTH_URL;

// ブラウザが付与する Origin ヘッダ。Better Auth は cookie 付き POST に origin/referer が
// 無いと CSRF として 403 を返すため、実際のクライアントと同様に origin を明示する。
// 値は BETTER_AUTH_URL と同様 vitest.config.ts の miniflare bindings を単一ソースとする
//（WEB_ORIGIN はカンマ区切りで複数指定できるため先頭を使う）。
const WEB_ORIGIN = env.WEB_ORIGIN.split(",")[0];

// Better Auth のアカウント削除エンドポイント（パスワード再入力方式）。
function deleteUser(cookie: string, password = "password1234") {
  return SELF.fetch(`${BASE}/api/auth/delete-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie, origin: WEB_ORIGIN },
    body: JSON.stringify({ password }),
  });
}

async function groupExists(groupId: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT id FROM `group` WHERE id = ?").bind(groupId).first();
  return row !== null;
}

describe("POST /api/auth/delete-user（アカウント削除）", () => {
  it("正しいパスワードでアカウントを削除でき、user とセッションが消える", async () => {
    const cookie = await signUpAndGetCookie("du-basic@example.com");
    const userId = await getUserId(env.DB, "du-basic@example.com");

    const res = await deleteUser(cookie);

    expect(res.status).toBe(200);
    const user = await env.DB.prepare("SELECT id FROM user WHERE id = ?").bind(userId).first();
    expect(user).toBeNull();
    const session = await env.DB.prepare("SELECT id FROM session WHERE user_id = ?")
      .bind(userId)
      .first();
    expect(session).toBeNull();
  });

  it("唯一メンバーだったグループは削除される", async () => {
    const cookie = await signUpAndGetCookie("du-solo@example.com");
    const groupId = await createGroup(cookie, "ひとりグループ");

    const res = await deleteUser(cookie);

    expect(res.status).toBe(200);
    expect(await groupExists(groupId)).toBe(false);
  });

  it("他メンバーが残るグループは残り、当人の所属記録だけ消える", async () => {
    const ownerCookie = await signUpAndGetCookie("du-owner@example.com");
    await signUpAndGetCookie("du-member@example.com");
    const memberId = await getUserId(env.DB, "du-member@example.com");
    const groupId = await createGroup(ownerCookie, "残るグループ");
    await addMember(groupId, memberId);

    const res = await deleteUser(ownerCookie);

    expect(res.status).toBe(200);
    expect(await groupExists(groupId)).toBe(true);
    const members = await env.DB.prepare("SELECT user_id FROM group_member WHERE group_id = ?")
      .bind(groupId)
      .all<{ user_id: string }>();
    expect(members.results.map((m) => m.user_id)).toEqual([memberId]);
  });

  it("ひとりグループと共有グループが混在する場合、ひとりグループだけ消える", async () => {
    const cookie = await signUpAndGetCookie("du-mixed@example.com");
    await signUpAndGetCookie("du-mixed-other@example.com");
    const otherId = await getUserId(env.DB, "du-mixed-other@example.com");
    const soloGroupId = await createGroup(cookie, "ひとり");
    const sharedGroupId = await createGroup(cookie, "ふたり");
    await addMember(sharedGroupId, otherId);

    const res = await deleteUser(cookie);

    expect(res.status).toBe(200);
    expect(await groupExists(soloGroupId)).toBe(false);
    expect(await groupExists(sharedGroupId)).toBe(true);
  });

  it("残るグループでも当人の支払・負担記録は CASCADE で消える（#33 の留意点）", async () => {
    const ownerCookie = await signUpAndGetCookie("du-cascade@example.com");
    await signUpAndGetCookie("du-cascade-member@example.com");
    const ownerId = await getUserId(env.DB, "du-cascade@example.com");
    const memberId = await getUserId(env.DB, "du-cascade-member@example.com");
    const groupId = await createGroup(ownerCookie, "精算データあり");
    await addMember(groupId, memberId);
    // owner が支払い、2 人で割勘した item をテスト用に直接 INSERT する。
    const itemId = crypto.randomUUID();
    const nowSec = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      "INSERT INTO item (id, group_id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(itemId, groupId, "食材", "unsettled", nowSec, nowSec)
      .run();
    await env.DB.prepare("INSERT INTO item_payment (item_id, user_id, amount) VALUES (?, ?, ?)")
      .bind(itemId, ownerId, 1000)
      .run();
    await env.DB.prepare(
      "INSERT INTO item_share (item_id, user_id, amount) VALUES (?, ?, ?), (?, ?, ?)",
    )
      .bind(itemId, ownerId, 500, itemId, memberId, 500)
      .run();

    const res = await deleteUser(ownerCookie);

    expect(res.status).toBe(200);
    // item 自体は残るが、削除した owner の支払・負担行は消える（残メンバーの負担行は残る）。
    const item = await env.DB.prepare("SELECT id FROM item WHERE id = ?").bind(itemId).first();
    expect(item).not.toBeNull();
    const payments = await env.DB.prepare("SELECT user_id FROM item_payment WHERE item_id = ?")
      .bind(itemId)
      .all();
    expect(payments.results).toEqual([]);
    const shares = await env.DB.prepare("SELECT user_id FROM item_share WHERE item_id = ?")
      .bind(itemId)
      .all<{ user_id: string }>();
    expect(shares.results.map((s) => s.user_id)).toEqual([memberId]);
  });

  // Better Auth はパスワード未指定だと fresh session での削除にフォールバックするが、
  // 本人確認をパスワード再入力で強制するため hooks.before で 400 にしている（ADR-0011）。
  it("パスワード未指定では fresh session でも削除されない", async () => {
    const cookie = await signUpAndGetCookie("du-no-password@example.com");
    const userId = await getUserId(env.DB, "du-no-password@example.com");

    const res = await SELF.fetch(`${BASE}/api/auth/delete-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie, origin: WEB_ORIGIN },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const user = await env.DB.prepare("SELECT id FROM user WHERE id = ?").bind(userId).first();
    expect(user).not.toBeNull();
  });

  it("空文字のパスワードでも削除されない", async () => {
    const cookie = await signUpAndGetCookie("du-empty-password@example.com");
    const userId = await getUserId(env.DB, "du-empty-password@example.com");

    const res = await deleteUser(cookie, "");

    expect(res.status).toBe(400);
    const user = await env.DB.prepare("SELECT id FROM user WHERE id = ?").bind(userId).first();
    expect(user).not.toBeNull();
  });

  it("誤ったパスワードでは削除されない", async () => {
    const cookie = await signUpAndGetCookie("du-wrong@example.com");
    const userId = await getUserId(env.DB, "du-wrong@example.com");

    const res = await deleteUser(cookie, "wrong-password");

    expect(res.status).toBe(400);
    const user = await env.DB.prepare("SELECT id FROM user WHERE id = ?").bind(userId).first();
    expect(user).not.toBeNull();
  });

  it("未ログインでは削除できない（401）", async () => {
    const res = await SELF.fetch(`${BASE}/api/auth/delete-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "password1234" }),
    });
    expect(res.status).toBe(401);
  });
});
