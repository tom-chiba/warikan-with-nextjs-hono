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

// 既存グループに member を直接 INSERT する（参加フローを介さずテスト用に追加）。
async function addMember(groupId: string, userId: string, role = "member") {
  const nowSec = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT INTO group_member (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)",
  )
    .bind(groupId, userId, role, nowSec)
    .run();
}

type CreateItemBody = {
  name: string;
  purchasedOn?: string | null;
  memo?: string | null;
  payments: { userId: string; amount: number }[];
  shares: { userId: string; amount: number }[];
};

function postItem(cookie: string, groupId: string, body: CreateItemBody) {
  return SELF.fetch(`${BASE}/groups/${groupId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

async function countRows(table: string, itemId: string): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE item_id = ?`)
    .bind(itemId)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

describe("POST /groups/:groupId/items（購入品の保存）", () => {
  it("メンバーが購入品を保存でき、item / item_payment / item_share が作成される", async () => {
    const ownerCookie = await signUpAndGetCookie("item-owner@example.com");
    const ownerId = await getUserId(env.DB, "item-owner@example.com");
    await signUpAndGetCookie("item-friend@example.com");
    const friendId = await getUserId(env.DB, "item-friend@example.com");
    const groupId = await createGroup(ownerCookie);
    await addMember(groupId, friendId);

    const res = await postItem(ownerCookie, groupId, {
      name: "ランチ",
      purchasedOn: "2026-06-01",
      memo: "駅前の店",
      // owner が 1000 円支払い、2 人で 500 円ずつ負担。
      payments: [{ userId: ownerId, amount: 1000 }],
      shares: [
        { userId: ownerId, amount: 500 },
        { userId: friendId, amount: 500 },
      ],
    });

    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(id).toBeTruthy();

    const item = await env.DB.prepare(
      "SELECT name, memo, status, purchased_on FROM item WHERE id = ?",
    )
      .bind(id)
      .first<{ name: string; memo: string; status: string; purchased_on: number | null }>();
    expect(item?.name).toBe("ランチ");
    expect(item?.memo).toBe("駅前の店");
    expect(item?.status).toBe("unsettled");
    // "YYYY-MM-DD" は UTC 0 時の Unix 秒として保存される（mode:"timestamp"）。
    expect(item?.purchased_on).toBe(new Date("2026-06-01").getTime() / 1000);

    expect(await countRows("item_payment", id)).toBe(1);
    expect(await countRows("item_share", id)).toBe(2);
  });

  it("購入日・メモ未指定でも保存できる（任意項目）", async () => {
    const cookie = await signUpAndGetCookie("item-optional@example.com");
    const userId = await getUserId(env.DB, "item-optional@example.com");
    const groupId = await createGroup(cookie);

    const res = await postItem(cookie, groupId, {
      name: "コーヒー",
      payments: [{ userId, amount: 300 }],
      shares: [{ userId, amount: 300 }],
    });

    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const item = await env.DB.prepare("SELECT memo, purchased_on FROM item WHERE id = ?")
      .bind(id)
      .first<{ memo: string | null; purchased_on: number | null }>();
    expect(item?.memo).toBeNull();
    expect(item?.purchased_on).toBeNull();
  });

  it("支払額合計 ≠ 割勘金額合計 なら 400 で保存されない", async () => {
    const cookie = await signUpAndGetCookie("item-mismatch@example.com");
    const userId = await getUserId(env.DB, "item-mismatch@example.com");
    const groupId = await createGroup(cookie);

    const res = await postItem(cookie, groupId, {
      name: "不一致",
      payments: [{ userId, amount: 1000 }],
      shares: [{ userId, amount: 900 }],
    });

    expect(res.status).toBe(400);
    const count = await env.DB.prepare("SELECT COUNT(*) AS c FROM item WHERE group_id = ?")
      .bind(groupId)
      .first<{ c: number }>();
    expect(count?.c).toBe(0);
  });

  it("合計 0 円は 400（空の購入品は保存しない）", async () => {
    const cookie = await signUpAndGetCookie("item-zero@example.com");
    const groupId = await createGroup(cookie);

    const res = await postItem(cookie, groupId, {
      name: "ゼロ",
      payments: [],
      shares: [],
    });

    expect(res.status).toBe(400);
  });

  it("amount が 0 以下の行は 400（0 円行は送らない仕様）", async () => {
    const cookie = await signUpAndGetCookie("item-nonpositive@example.com");
    const userId = await getUserId(env.DB, "item-nonpositive@example.com");
    const groupId = await createGroup(cookie);

    const res = await postItem(cookie, groupId, {
      name: "ゼロ行",
      payments: [{ userId, amount: 0 }],
      shares: [{ userId, amount: 0 }],
    });

    expect(res.status).toBe(400);
  });

  it("グループに属さない userId を含むと 400", async () => {
    const cookie = await signUpAndGetCookie("item-outsider-owner@example.com");
    const ownerId = await getUserId(env.DB, "item-outsider-owner@example.com");
    await signUpAndGetCookie("item-outsider@example.com");
    const outsiderId = await getUserId(env.DB, "item-outsider@example.com");
    const groupId = await createGroup(cookie);

    const res = await postItem(cookie, groupId, {
      name: "部外者",
      payments: [{ userId: ownerId, amount: 1000 }],
      shares: [
        { userId: ownerId, amount: 500 },
        { userId: outsiderId, amount: 500 },
      ],
    });

    expect(res.status).toBe(400);
    const count = await env.DB.prepare("SELECT COUNT(*) AS c FROM item WHERE group_id = ?")
      .bind(groupId)
      .first<{ c: number }>();
    expect(count?.c).toBe(0);
  });

  it("同一メンバーが重複する行は 400", async () => {
    const cookie = await signUpAndGetCookie("item-dup@example.com");
    const userId = await getUserId(env.DB, "item-dup@example.com");
    const groupId = await createGroup(cookie);

    const res = await postItem(cookie, groupId, {
      name: "重複",
      payments: [{ userId, amount: 1000 }],
      shares: [
        { userId, amount: 500 },
        { userId, amount: 500 },
      ],
    });

    expect(res.status).toBe(400);
  });

  it("当該グループのメンバーでなければ 403（認可）", async () => {
    const ownerCookie = await signUpAndGetCookie("item-auth-owner@example.com");
    const ownerId = await getUserId(env.DB, "item-auth-owner@example.com");
    const strangerCookie = await signUpAndGetCookie("item-stranger@example.com");
    const groupId = await createGroup(ownerCookie);

    const res = await postItem(strangerCookie, groupId, {
      name: "他人",
      payments: [{ userId: ownerId, amount: 1000 }],
      shares: [{ userId: ownerId, amount: 1000 }],
    });

    expect(res.status).toBe(403);
  });

  it("未ログインなら 401", async () => {
    const ownerCookie = await signUpAndGetCookie("item-noauth-owner@example.com");
    const ownerId = await getUserId(env.DB, "item-noauth-owner@example.com");
    const groupId = await createGroup(ownerCookie);

    const res = await SELF.fetch(`${BASE}/groups/${groupId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "未ログイン",
        payments: [{ userId: ownerId, amount: 1000 }],
        shares: [{ userId: ownerId, amount: 1000 }],
      }),
    });

    expect(res.status).toBe(401);
  });
});
