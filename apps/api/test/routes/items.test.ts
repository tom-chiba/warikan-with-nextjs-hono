import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { getUserId, signUpAndGetCookie } from "../helpers/auth-session";
import { addMember, createGroup } from "../helpers/group";

const BASE = env.BETTER_AUTH_URL;

type CreateItemBody = {
  name: string;
  purchasedOn?: string | null;
  memo?: string | null;
  kind?: "expense" | "income";
  payments: { userId: string; amount: number }[];
  shares: { userId: string; amount: number }[];
};

// kind は API 側で必須（PUT で省略すると既存の kind が意図せず変わりうるため）だが、
// このヘルパーでは kind を省略したテストが引き続き動くよう既定で expense を補う。
// 「kind を省略すると 400」自体を検証するテストは、このヘルパーを経由せず直接 fetch する。
function postItem(cookie: string, groupId: string, body: CreateItemBody) {
  return SELF.fetch(`${BASE}/groups/${groupId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ kind: "expense", ...body }),
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

  it("kind を省略すると 400（PUT での意図しない上書きを防ぐため必須）", async () => {
    const cookie = await signUpAndGetCookie("item-kind-required@example.com");
    const userId = await getUserId(env.DB, "item-kind-required@example.com");
    const groupId = await createGroup(cookie);

    // postItem ヘルパーを介さず直接 fetch し、kind を本当に省略する。
    const res = await SELF.fetch(`${BASE}/groups/${groupId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        name: "コーヒー",
        payments: [{ userId, amount: 300 }],
        shares: [{ userId, amount: 300 }],
      }),
    });

    expect(res.status).toBe(400);
  });

  it("kind: income で保存でき、そのまま返る（収入分配機能）", async () => {
    const cookie = await signUpAndGetCookie("item-kind-income@example.com");
    const userId = await getUserId(env.DB, "item-kind-income@example.com");
    const groupId = await createGroup(cookie);

    const res = await postItem(cookie, groupId, {
      name: "臨時給付金",
      kind: "income",
      payments: [{ userId, amount: 120000 }],
      shares: [{ userId, amount: 120000 }],
    });

    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const item = await env.DB.prepare("SELECT kind FROM item WHERE id = ?")
      .bind(id)
      .first<{ kind: string }>();
    expect(item?.kind).toBe("income");

    const got = await getItem(cookie, groupId, id);
    const { item: fetched } = (await got.json()) as { item: ListedItem };
    expect(fetched.kind).toBe("income");
    expect(fetched.total).toBe(120000);
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

function listItems(cookie: string, groupId: string, status?: "unsettled" | "settled") {
  const qs = status ? `?status=${status}` : "";
  return SELF.fetch(`${BASE}/groups/${groupId}/items${qs}`, { headers: { cookie } });
}

function getItem(cookie: string, groupId: string, itemId: string) {
  return SELF.fetch(`${BASE}/groups/${groupId}/items/${itemId}`, { headers: { cookie } });
}

// postItem 同様、kind 省略時は expense を補う（省略時 400 の検証は直接 fetch する）。
function putItem(cookie: string, groupId: string, itemId: string, body: CreateItemBody) {
  return SELF.fetch(`${BASE}/groups/${groupId}/items/${itemId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ kind: "expense", ...body }),
  });
}

function deleteItem(cookie: string, groupId: string, itemId: string) {
  return SELF.fetch(`${BASE}/groups/${groupId}/items/${itemId}`, {
    method: "DELETE",
    headers: { cookie },
  });
}

// transfers は画面で確認した送金リスト（ADR-0013 でサーバー側検証が入った）。
// 単独メンバーのアイテムは収支が常に均衡するため、既定は空配列（送金不要）。
function settle(
  cookie: string,
  groupId: string,
  itemIds: string[],
  transfers: { from: string; to: string; amount: number }[] = [],
) {
  return SELF.fetch(`${BASE}/groups/${groupId}/settlements`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ itemIds, transfers }),
  });
}

function unsettle(cookie: string, groupId: string, itemIds: string[]) {
  return SELF.fetch(`${BASE}/groups/${groupId}/unsettlements`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ itemIds }),
  });
}

type ListedItem = {
  id: string;
  name: string;
  purchasedOn: string | null;
  total: number;
  status: string;
  kind: "expense" | "income";
  payments: { userId: string; amount: number }[];
  shares: { userId: string; amount: number }[];
};

describe("GET /groups/:groupId/items（未精算一覧）", () => {
  it("未精算アイテムが合計金額・payments・shares 付きで返る", async () => {
    const ownerCookie = await signUpAndGetCookie("list-owner@example.com");
    const ownerId = await getUserId(env.DB, "list-owner@example.com");
    await signUpAndGetCookie("list-friend@example.com");
    const friendId = await getUserId(env.DB, "list-friend@example.com");
    const groupId = await createGroup(ownerCookie);
    await addMember(groupId, friendId);

    await postItem(ownerCookie, groupId, {
      name: "ランチ",
      purchasedOn: "2026-06-01",
      payments: [{ userId: ownerId, amount: 1000 }],
      shares: [
        { userId: ownerId, amount: 500 },
        { userId: friendId, amount: 500 },
      ],
    });

    const res = await listItems(ownerCookie, groupId, "unsettled");
    expect(res.status).toBe(200);
    const { items } = (await res.json()) as { items: ListedItem[] };
    expect(items).toHaveLength(1);
    const [it] = items;
    expect(it.name).toBe("ランチ");
    expect(it.total).toBe(1000);
    expect(it.purchasedOn).toBe(new Date("2026-06-01").toISOString());
    expect(it.payments).toHaveLength(1);
    expect(it.shares).toHaveLength(2);
  });

  it("status を指定しなければ未精算のみが返る（精算済は含まれない）", async () => {
    const cookie = await signUpAndGetCookie("list-status@example.com");
    const userId = await getUserId(env.DB, "list-status@example.com");
    const groupId = await createGroup(cookie);

    const r1 = await postItem(cookie, groupId, {
      name: "未精算",
      payments: [{ userId, amount: 300 }],
      shares: [{ userId, amount: 300 }],
    });
    const settledId = ((await r1.json()) as { id: string }).id;
    await settle(cookie, groupId, [settledId]);
    await postItem(cookie, groupId, {
      name: "もう一つ未精算",
      payments: [{ userId, amount: 200 }],
      shares: [{ userId, amount: 200 }],
    });

    const unsettled = (await (await listItems(cookie, groupId)).json()) as { items: ListedItem[] };
    expect(unsettled.items).toHaveLength(1);
    expect(unsettled.items[0].name).toBe("もう一つ未精算");

    const settledList = (await (await listItems(cookie, groupId, "settled")).json()) as {
      items: ListedItem[];
    };
    expect(settledList.items).toHaveLength(1);
    expect(settledList.items[0].name).toBe("未精算");
  });

  it("0 件なら空配列", async () => {
    const cookie = await signUpAndGetCookie("list-empty@example.com");
    const groupId = await createGroup(cookie);
    const { items } = (await (await listItems(cookie, groupId)).json()) as { items: ListedItem[] };
    expect(items).toEqual([]);
  });

  it("当該グループのメンバーでなければ 403", async () => {
    const ownerCookie = await signUpAndGetCookie("list-auth-owner@example.com");
    const strangerCookie = await signUpAndGetCookie("list-stranger@example.com");
    const groupId = await createGroup(ownerCookie);
    const res = await listItems(strangerCookie, groupId);
    expect(res.status).toBe(403);
  });
});

describe("GET /groups/:groupId/items/:itemId（単一取得）", () => {
  it("payments / shares 付きで単一アイテムを返す", async () => {
    const cookie = await signUpAndGetCookie("single-owner@example.com");
    const userId = await getUserId(env.DB, "single-owner@example.com");
    const groupId = await createGroup(cookie);
    const created = await postItem(cookie, groupId, {
      name: "コーヒー",
      payments: [{ userId, amount: 400 }],
      shares: [{ userId, amount: 400 }],
    });
    const itemId = ((await created.json()) as { id: string }).id;

    const res = await getItem(cookie, groupId, itemId);
    expect(res.status).toBe(200);
    const { item } = (await res.json()) as { item: ListedItem };
    expect(item.name).toBe("コーヒー");
    expect(item.total).toBe(400);
    expect(item.payments).toEqual([{ userId, amount: 400 }]);
  });

  it("存在しない id は 404", async () => {
    const cookie = await signUpAndGetCookie("single-404@example.com");
    const groupId = await createGroup(cookie);
    const res = await getItem(cookie, groupId, "no-such-id");
    expect(res.status).toBe(404);
  });
});

describe("PUT /groups/:groupId/items/:itemId（更新）", () => {
  it("内容・支払額・割勘金額を更新でき、payments / shares が差し替わる", async () => {
    const ownerCookie = await signUpAndGetCookie("put-owner@example.com");
    const ownerId = await getUserId(env.DB, "put-owner@example.com");
    await signUpAndGetCookie("put-friend@example.com");
    const friendId = await getUserId(env.DB, "put-friend@example.com");
    const groupId = await createGroup(ownerCookie);
    await addMember(groupId, friendId);

    const created = await postItem(ownerCookie, groupId, {
      name: "旧",
      payments: [{ userId: ownerId, amount: 1000 }],
      shares: [{ userId: ownerId, amount: 1000 }],
    });
    const itemId = ((await created.json()) as { id: string }).id;

    const res = await putItem(ownerCookie, groupId, itemId, {
      name: "新",
      purchasedOn: "2026-06-02",
      payments: [{ userId: friendId, amount: 800 }],
      shares: [
        { userId: ownerId, amount: 400 },
        { userId: friendId, amount: 400 },
      ],
    });
    expect(res.status).toBe(200);

    const item = await env.DB.prepare("SELECT name, purchased_on FROM item WHERE id = ?")
      .bind(itemId)
      .first<{ name: string; purchased_on: number | null }>();
    expect(item?.name).toBe("新");
    expect(item?.purchased_on).toBe(new Date("2026-06-02").getTime() / 1000);
    // payments は friend 1 行に差し替わり、shares は 2 行になる。
    expect(await countRows("item_payment", itemId)).toBe(1);
    expect(await countRows("item_share", itemId)).toBe(2);
  });

  it("kind を省略した PUT は 400 になり、既存の kind は変わらない（収入分配機能）", async () => {
    const cookie = await signUpAndGetCookie("put-kind-required@example.com");
    const userId = await getUserId(env.DB, "put-kind-required@example.com");
    const groupId = await createGroup(cookie);
    const created = await postItem(cookie, groupId, {
      name: "臨時給付金",
      kind: "income",
      payments: [{ userId, amount: 1000 }],
      shares: [{ userId, amount: 1000 }],
    });
    const itemId = ((await created.json()) as { id: string }).id;

    // putItem ヘルパーを介さず直接 fetch し、kind を本当に省略する。
    const res = await SELF.fetch(`${BASE}/groups/${groupId}/items/${itemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        name: "臨時給付金",
        payments: [{ userId, amount: 1000 }],
        shares: [{ userId, amount: 1000 }],
      }),
    });
    expect(res.status).toBe(400);

    const item = await env.DB.prepare("SELECT kind FROM item WHERE id = ?")
      .bind(itemId)
      .first<{ kind: string }>();
    expect(item?.kind).toBe("income");
  });

  it("支払額合計 ≠ 割勘金額合計 なら 400", async () => {
    const cookie = await signUpAndGetCookie("put-mismatch@example.com");
    const userId = await getUserId(env.DB, "put-mismatch@example.com");
    const groupId = await createGroup(cookie);
    const created = await postItem(cookie, groupId, {
      name: "元",
      payments: [{ userId, amount: 500 }],
      shares: [{ userId, amount: 500 }],
    });
    const itemId = ((await created.json()) as { id: string }).id;

    const res = await putItem(cookie, groupId, itemId, {
      name: "不一致",
      payments: [{ userId, amount: 500 }],
      shares: [{ userId, amount: 400 }],
    });
    expect(res.status).toBe(400);
  });

  it("存在しない id の更新は 404", async () => {
    const cookie = await signUpAndGetCookie("put-404@example.com");
    const userId = await getUserId(env.DB, "put-404@example.com");
    const groupId = await createGroup(cookie);
    const res = await putItem(cookie, groupId, "no-such-id", {
      name: "x",
      payments: [{ userId, amount: 100 }],
      shares: [{ userId, amount: 100 }],
    });
    expect(res.status).toBe(404);
  });

  it("精算済アイテムも更新できる（200・status は settled のまま）", async () => {
    const cookie = await signUpAndGetCookie("put-settled@example.com");
    const userId = await getUserId(env.DB, "put-settled@example.com");
    const groupId = await createGroup(cookie);
    const created = await postItem(cookie, groupId, {
      name: "精算済",
      payments: [{ userId, amount: 500 }],
      shares: [{ userId, amount: 500 }],
    });
    const itemId = ((await created.json()) as { id: string }).id;
    await settle(cookie, groupId, [itemId]);

    const res = await putItem(cookie, groupId, itemId, {
      name: "訂正後",
      payments: [{ userId, amount: 999 }],
      shares: [{ userId, amount: 999 }],
    });
    expect(res.status).toBe(200);
    // 内容が更新され、status は settled のまま変わらないこと。
    const row = await env.DB.prepare("SELECT name, status FROM item WHERE id = ?")
      .bind(itemId)
      .first<{ name: string; status: string }>();
    expect(row?.name).toBe("訂正後");
    expect(row?.status).toBe("settled");
  });
});

describe("DELETE /groups/:groupId/items/:itemId（削除）", () => {
  it("アイテムを削除でき、item_payment / item_share も消える", async () => {
    const cookie = await signUpAndGetCookie("del-owner@example.com");
    const userId = await getUserId(env.DB, "del-owner@example.com");
    const groupId = await createGroup(cookie);
    const created = await postItem(cookie, groupId, {
      name: "削除対象",
      payments: [{ userId, amount: 600 }],
      shares: [{ userId, amount: 600 }],
    });
    const itemId = ((await created.json()) as { id: string }).id;

    const res = await deleteItem(cookie, groupId, itemId);
    expect(res.status).toBe(200);
    const count = await env.DB.prepare("SELECT COUNT(*) AS c FROM item WHERE id = ?")
      .bind(itemId)
      .first<{ c: number }>();
    expect(count?.c).toBe(0);
    expect(await countRows("item_payment", itemId)).toBe(0);
    expect(await countRows("item_share", itemId)).toBe(0);
  });

  it("存在しない id の削除は 404", async () => {
    const cookie = await signUpAndGetCookie("del-404@example.com");
    const groupId = await createGroup(cookie);
    const res = await deleteItem(cookie, groupId, "no-such-id");
    expect(res.status).toBe(404);
  });

  it("精算済アイテムも削除できる（200）", async () => {
    const cookie = await signUpAndGetCookie("del-settled@example.com");
    const userId = await getUserId(env.DB, "del-settled@example.com");
    const groupId = await createGroup(cookie);
    const created = await postItem(cookie, groupId, {
      name: "精算済",
      payments: [{ userId, amount: 500 }],
      shares: [{ userId, amount: 500 }],
    });
    const itemId = ((await created.json()) as { id: string }).id;
    await settle(cookie, groupId, [itemId]);

    const res = await deleteItem(cookie, groupId, itemId);
    expect(res.status).toBe(200);
    const count = await env.DB.prepare("SELECT COUNT(*) AS c FROM item WHERE id = ?")
      .bind(itemId)
      .first<{ c: number }>();
    expect(count?.c).toBe(0);
  });
});

describe("POST /groups/:groupId/settlements（精算実行）", () => {
  it("選択アイテムを精算済にし、未精算一覧から消える", async () => {
    const cookie = await signUpAndGetCookie("settle-owner@example.com");
    const userId = await getUserId(env.DB, "settle-owner@example.com");
    const groupId = await createGroup(cookie);
    const r1 = await postItem(cookie, groupId, {
      name: "A",
      payments: [{ userId, amount: 100 }],
      shares: [{ userId, amount: 100 }],
    });
    const r2 = await postItem(cookie, groupId, {
      name: "B",
      payments: [{ userId, amount: 200 }],
      shares: [{ userId, amount: 200 }],
    });
    const id1 = ((await r1.json()) as { id: string }).id;
    const id2 = ((await r2.json()) as { id: string }).id;

    const res = await settle(cookie, groupId, [id1, id2]);
    expect(res.status).toBe(200);
    const { settled } = (await res.json()) as { settled: string[] };
    expect(settled.sort()).toEqual([id1, id2].sort());

    const unsettled = (await (await listItems(cookie, groupId)).json()) as { items: ListedItem[] };
    expect(unsettled.items).toHaveLength(0);
  });

  it("複数人の割勘でも、画面で確認した送金リストと一致すれば精算できる", async () => {
    const ownerCookie = await signUpAndGetCookie("settle-verify-owner@example.com");
    const ownerId = await getUserId(env.DB, "settle-verify-owner@example.com");
    await signUpAndGetCookie("settle-verify-friend@example.com");
    const friendId = await getUserId(env.DB, "settle-verify-friend@example.com");
    const groupId = await createGroup(ownerCookie);
    await addMember(groupId, friendId);

    // owner が 1000 立替、500 ずつ負担 → friend から owner へ 500 円。
    const created = await postItem(ownerCookie, groupId, {
      name: "ランチ",
      payments: [{ userId: ownerId, amount: 1000 }],
      shares: [
        { userId: ownerId, amount: 500 },
        { userId: friendId, amount: 500 },
      ],
    });
    const itemId = ((await created.json()) as { id: string }).id;

    const res = await settle(
      ownerCookie,
      groupId,
      [itemId],
      [{ from: friendId, to: ownerId, amount: 500 }],
    );
    expect(res.status).toBe(200);
    const { settled } = (await res.json()) as { settled: string[] };
    expect(settled).toEqual([itemId]);
  });

  it("送金リストがサーバー側の再計算と一致しなければ 409 で拒否され、何も更新されない", async () => {
    const ownerCookie = await signUpAndGetCookie("settle-mismatch-owner@example.com");
    const ownerId = await getUserId(env.DB, "settle-mismatch-owner@example.com");
    await signUpAndGetCookie("settle-mismatch-friend@example.com");
    const friendId = await getUserId(env.DB, "settle-mismatch-friend@example.com");
    const groupId = await createGroup(ownerCookie);
    await addMember(groupId, friendId);

    const created = await postItem(ownerCookie, groupId, {
      name: "ランチ",
      payments: [{ userId: ownerId, amount: 1000 }],
      shares: [
        { userId: ownerId, amount: 500 },
        { userId: friendId, amount: 500 },
      ],
    });
    const itemId = ((await created.json()) as { id: string }).id;

    // 金額が誤っている（500 円のはずが 300 円）→ 409。
    const res = await settle(
      ownerCookie,
      groupId,
      [itemId],
      [{ from: friendId, to: ownerId, amount: 300 }],
    );
    expect(res.status).toBe(409);

    // アイテムは未精算のまま残っている。
    const unsettled = (await (await listItems(ownerCookie, groupId)).json()) as {
      items: ListedItem[];
    };
    expect(unsettled.items.map((i) => i.id)).toEqual([itemId]);
  });

  it("income と expense が混在しても正しい送金リストで精算できる（収入分配機能）", async () => {
    const ownerCookie = await signUpAndGetCookie("settle-mixed-owner@example.com");
    const ownerId = await getUserId(env.DB, "settle-mixed-owner@example.com");
    await signUpAndGetCookie("settle-mixed-friend@example.com");
    const friendId = await getUserId(env.DB, "settle-mixed-friend@example.com");
    const groupId = await createGroup(ownerCookie);
    await addMember(groupId, friendId);

    // 収入 900 を owner が受け取り、2 人で 450 ずつ分担 → この 1 件だけなら owner:-450, friend:+450。
    const income = await postItem(ownerCookie, groupId, {
      name: "臨時給付金",
      kind: "income",
      payments: [{ userId: ownerId, amount: 900 }],
      shares: [
        { userId: ownerId, amount: 450 },
        { userId: friendId, amount: 450 },
      ],
    });
    const incomeId = ((await income.json()) as { id: string }).id;

    // 支出 300 を friend が立替え、2 人で 150 ずつ分担 → この 1 件だけなら friend:+150, owner:-150。
    const expense = await postItem(ownerCookie, groupId, {
      name: "ランチ",
      kind: "expense",
      payments: [{ userId: friendId, amount: 300 }],
      shares: [
        { userId: ownerId, amount: 150 },
        { userId: friendId, amount: 150 },
      ],
    });
    const expenseId = ((await expense.json()) as { id: string }).id;

    // 混在させると owner:-600, friend:+600 に合算され、送金は owner → friend 600 円の 1 件になる。
    const res = await settle(
      ownerCookie,
      groupId,
      [incomeId, expenseId],
      [{ from: ownerId, to: friendId, amount: 600 }],
    );
    expect(res.status).toBe(200);
    const { settled } = (await res.json()) as { settled: string[] };
    expect(settled.sort()).toEqual([incomeId, expenseId].sort());
  });

  it("存在しない・他グループ・精算済みの id が混じっていたら 409 で拒否され、何も更新されない", async () => {
    const cookie = await signUpAndGetCookie("settle-scope@example.com");
    const userId = await getUserId(env.DB, "settle-scope@example.com");
    const groupId = await createGroup(cookie);
    const created = await postItem(cookie, groupId, {
      name: "対象",
      payments: [{ userId, amount: 100 }],
      shares: [{ userId, amount: 100 }],
    });
    const itemId = ((await created.json()) as { id: string }).id;

    // 一覧が古い（混入 id がある）→ 部分的に精算せず全体を拒否する（ADR-0013）。
    const res = await settle(cookie, groupId, [itemId, "foreign-id"]);
    expect(res.status).toBe(409);

    const unsettled = (await (await listItems(cookie, groupId)).json()) as {
      items: ListedItem[];
    };
    expect(unsettled.items.map((i) => i.id)).toEqual([itemId]);
  });

  it("当該グループのメンバーでなければ 403", async () => {
    const ownerCookie = await signUpAndGetCookie("settle-auth-owner@example.com");
    const strangerCookie = await signUpAndGetCookie("settle-stranger@example.com");
    const groupId = await createGroup(ownerCookie);
    const res = await settle(strangerCookie, groupId, ["anything"]);
    expect(res.status).toBe(403);
  });
});

describe("POST /groups/:groupId/unsettlements（未精算に戻す）", () => {
  it("精算済アイテムを未精算に戻せ、未精算一覧に再表示される", async () => {
    const cookie = await signUpAndGetCookie("unsettle-owner@example.com");
    const userId = await getUserId(env.DB, "unsettle-owner@example.com");
    const groupId = await createGroup(cookie);
    const created = await postItem(cookie, groupId, {
      name: "戻す対象",
      payments: [{ userId, amount: 100 }],
      shares: [{ userId, amount: 100 }],
    });
    const itemId = ((await created.json()) as { id: string }).id;
    await settle(cookie, groupId, [itemId]);

    const res = await unsettle(cookie, groupId, [itemId]);
    expect(res.status).toBe(200);
    const { unsettled } = (await res.json()) as { unsettled: string[] };
    expect(unsettled).toEqual([itemId]);

    // 未精算一覧に再表示され、精算済一覧からは消える。
    const unsettledList = (await (await listItems(cookie, groupId)).json()) as {
      items: ListedItem[];
    };
    expect(unsettledList.items.map((i) => i.id)).toEqual([itemId]);
    const settledList = (await (await listItems(cookie, groupId, "settled")).json()) as {
      items: ListedItem[];
    };
    expect(settledList.items).toHaveLength(0);
  });

  it("他グループ／未精算の id は巻き込まれない（unsettled に含まれない）", async () => {
    const cookie = await signUpAndGetCookie("unsettle-scope@example.com");
    const userId = await getUserId(env.DB, "unsettle-scope@example.com");
    const groupId = await createGroup(cookie);
    const r1 = await postItem(cookie, groupId, {
      name: "精算済",
      payments: [{ userId, amount: 100 }],
      shares: [{ userId, amount: 100 }],
    });
    const settledId = ((await r1.json()) as { id: string }).id;
    await settle(cookie, groupId, [settledId]);
    const r2 = await postItem(cookie, groupId, {
      name: "未精算のまま",
      payments: [{ userId, amount: 200 }],
      shares: [{ userId, amount: 200 }],
    });
    const unsettledId = ((await r2.json()) as { id: string }).id;

    const res = await unsettle(cookie, groupId, [settledId, unsettledId, "foreign-id"]);
    const { unsettled } = (await res.json()) as { unsettled: string[] };
    expect(unsettled).toEqual([settledId]);
  });

  it("itemIds が空配列なら 400", async () => {
    const cookie = await signUpAndGetCookie("unsettle-empty@example.com");
    const groupId = await createGroup(cookie);
    const res = await unsettle(cookie, groupId, []);
    expect(res.status).toBe(400);
  });

  it("当該グループのメンバーでなければ 403", async () => {
    const ownerCookie = await signUpAndGetCookie("unsettle-auth-owner@example.com");
    const strangerCookie = await signUpAndGetCookie("unsettle-stranger@example.com");
    const groupId = await createGroup(ownerCookie);
    const res = await unsettle(strangerCookie, groupId, ["anything"]);
    expect(res.status).toBe(403);
  });
});
