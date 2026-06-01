import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { DbVariables, GroupMemberVariables } from "../context";
import { groupMember, item, itemPayment, itemShare } from "../db/schema";

// メンバーごとの金額入力（支払額・割勘金額の各行）。amount は正の整数（円）。
// 0 円（支払い／負担なし）の行はそもそも送らない仕様のため positive で弾く。
const amountEntry = z.object({
  userId: z.string().min(1),
  amount: z.number().int().positive(),
});

// 購入品の保存・更新の入力。purchasedOn は input type="date" の値（"YYYY-MM-DD"）。
// 購入日・メモは任意（未入力なら null 相当）。新規(POST)・更新(PUT)で共通。
const itemSchema = z.object({
  name: z.string().trim().min(1).max(100),
  purchasedOn: z.iso.date().nullish(),
  memo: z.string().max(500).nullish(),
  payments: z.array(amountEntry),
  shares: z.array(amountEntry),
});

const sumAmount = (entries: { amount: number }[]) => entries.reduce((acc, e) => acc + e.amount, 0);

const hasDuplicateUser = (entries: { userId: string }[]) =>
  new Set(entries.map((e) => e.userId)).size !== entries.length;

// 割勘の整合性チェック（支払額合計 = 割勘金額合計・合計 > 0・同一メンバー重複なし）。
// 問題があればエラーメッセージ、なければ null を返す。POST/PUT で共通。
function validateAmounts(payments: { userId: string; amount: number }[], shares: typeof payments) {
  const paymentTotal = sumAmount(payments);
  const shareTotal = sumAmount(shares);
  if (paymentTotal === 0 || paymentTotal !== shareTotal) {
    return "支払額合計と割勘金額合計が一致していません";
  }
  if (hasDuplicateUser(payments) || hasDuplicateUser(shares)) {
    return "同一メンバーが重複しています";
  }
  return null;
}

// 当該グループの全メンバー userId 集合を返す（payments/shares の userId 検証用）。
async function groupMemberIds(
  db: (GroupMemberVariables & DbVariables)["db"],
  groupId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ userId: groupMember.userId })
    .from(groupMember)
    .where(eq(groupMember.groupId, groupId));
  return new Set(rows.map((m) => m.userId));
}

// itemId をキーに金額行をまとめる（一覧で item ごとの payments/shares を組み立てる用）。
function groupByItem<T extends { itemId: string; userId: string; amount: number }>(rows: T[]) {
  const map = new Map<string, { userId: string; amount: number }[]>();
  for (const { itemId, userId, amount } of rows) {
    const list = map.get(itemId);
    if (list) {
      list.push({ userId, amount });
    } else {
      map.set(itemId, [{ userId, amount }]);
    }
  }
  return map;
}

// 金額行（payments / shares）を子テーブル挿入用の行（itemId 付き）へ変換する。保存(POST)・更新(PUT)で共通。
const makeRows = (itemId: string, entries: { userId: string; amount: number }[]) =>
  entries.map((e) => ({ itemId, ...e }));

// /groups/:groupId 配下の保護ルート（当該グループのメンバー限定）。
// 認可ミドルウェア（requireAuth / provideDb / requireGroupMember）は index.ts 側でマウントするため、
// ここでは Bindings(Env) を持たず Variables だけ型付けする。これにより rpc.ts の AppType に
// Workers 固有型が混入せず、フロントエンドが型解決できる状態を保てる（ADR-0009 / ADR-0010）。
export const items = new Hono<{
  Variables: GroupMemberVariables & DbVariables;
}>()
  // 購入品を保存する。
  .post("/:groupId/items", zValidator("json", itemSchema), async (c) => {
    const member = c.get("groupMember");
    const db = c.get("db");
    const { name, purchasedOn, memo, payments, shares } = c.req.valid("json");

    const amountError = validateAmounts(payments, shares);
    if (amountError) {
      return c.json({ error: amountError }, 400);
    }

    // payments / shares の全 userId が当該グループのメンバーであることを検証する
    //（他グループや非メンバーの userId 混入を防ぐ）。
    const memberIds = await groupMemberIds(db, member.groupId);
    const allUserIds = [...payments, ...shares].map((e) => e.userId);
    if (allUserIds.some((id) => !memberIds.has(id))) {
      return c.json({ error: "グループに属さないメンバーが含まれています" }, 400);
    }

    // item + item_payment + item_share を db.batch()（D1 の暗黙の SQL トランザクション = all-or-nothing）で
    // 原子的に作成する。id は JS 側で確定させ子テーブルと共有する。status は既定の "unsettled"（未精算）。
    // D1 は対話的トランザクション（db.transaction()）非対応のため batch を用いる（groups-collection と同方針）。
    // 合計 > 0 を満たすため payments / shares はいずれも 1 件以上で、空配列 insert にはならない。
    const id = crypto.randomUUID();
    await db.batch([
      db.insert(item).values({
        id,
        groupId: member.groupId,
        name,
        // "YYYY-MM-DD" を UTC 0 時として保存する（Workers は UTC 固定で保存・読出が一貫する）。
        // 表示時は UTC で日付部分を取り出すこと（ローカルTZ で解釈すると前日に見える端末が出る）。
        purchasedOn: purchasedOn ? new Date(purchasedOn) : null,
        memo: memo ?? null,
      }),
      db.insert(itemPayment).values(makeRows(id, payments)),
      db.insert(itemShare).values(makeRows(id, shares)),
    ]);

    return c.json({ id }, 201);
  })
  // 購入品を一覧で返す。status（既定 unsettled）で絞り込み、各 item に合計金額と
  // メンバーごとの payments / shares を埋め込む（送金計算・編集プリフィルに使う）。
  .get(
    "/:groupId/items",
    zValidator(
      "query",
      z.object({ status: z.enum(["unsettled", "settled"]).default("unsettled") }),
    ),
    async (c) => {
      const member = c.get("groupMember");
      const db = c.get("db");
      const { status } = c.req.valid("query");

      const rows = await db
        .select()
        .from(item)
        .where(and(eq(item.groupId, member.groupId), eq(item.status, status)))
        .orderBy(desc(item.createdAt));

      const ids = rows.map((r) => r.id);
      const payments = ids.length
        ? await db.select().from(itemPayment).where(inArray(itemPayment.itemId, ids))
        : [];
      const shares = ids.length
        ? await db.select().from(itemShare).where(inArray(itemShare.itemId, ids))
        : [];
      const paymentsByItem = groupByItem(payments);
      const sharesByItem = groupByItem(shares);

      return c.json({
        items: rows.map((r) => {
          const itemPayments = paymentsByItem.get(r.id) ?? [];
          return {
            id: r.id,
            name: r.name,
            purchasedOn: r.purchasedOn ? r.purchasedOn.toISOString() : null,
            memo: r.memo,
            status: r.status,
            // 合計金額 = 支払額合計（Issue #19）。
            total: sumAmount(itemPayments),
            payments: itemPayments,
            shares: sharesByItem.get(r.id) ?? [],
          };
        }),
      });
    },
  )
  // 単一の購入品を返す（編集フォームのプリフィル・直リンク対応）。
  .get("/:groupId/items/:itemId", async (c) => {
    const member = c.get("groupMember");
    const db = c.get("db");
    const itemId = c.req.param("itemId");

    const row = await db
      .select()
      .from(item)
      .where(and(eq(item.id, itemId), eq(item.groupId, member.groupId)))
      .get();
    if (!row) {
      return c.json({ error: "Not Found" }, 404);
    }

    const payments = await db
      .select({ userId: itemPayment.userId, amount: itemPayment.amount })
      .from(itemPayment)
      .where(eq(itemPayment.itemId, itemId));
    const shares = await db
      .select({ userId: itemShare.userId, amount: itemShare.amount })
      .from(itemShare)
      .where(eq(itemShare.itemId, itemId));

    return c.json({
      item: {
        id: row.id,
        name: row.name,
        purchasedOn: row.purchasedOn ? row.purchasedOn.toISOString() : null,
        memo: row.memo,
        status: row.status,
        total: sumAmount(payments),
        payments,
        shares,
      },
    });
  })
  // 購入品を更新する。バリデーションは保存(POST)と同一。item を更新し、payments / shares は
  // 全削除 → 再挿入で差し替える。これらを db.batch()（all-or-nothing）で原子的に行う。
  .put("/:groupId/items/:itemId", zValidator("json", itemSchema), async (c) => {
    const member = c.get("groupMember");
    const db = c.get("db");
    const itemId = c.req.param("itemId");
    const { name, purchasedOn, memo, payments, shares } = c.req.valid("json");

    const amountError = validateAmounts(payments, shares);
    if (amountError) {
      return c.json({ error: amountError }, 400);
    }

    const memberIds = await groupMemberIds(db, member.groupId);
    const allUserIds = [...payments, ...shares].map((e) => e.userId);
    if (allUserIds.some((id) => !memberIds.has(id))) {
      return c.json({ error: "グループに属さないメンバーが含まれています" }, 400);
    }

    // 対象が当該グループの未精算 item として存在するか確認する。編集は未精算アイテムのみ可とし、
    // 精算済（settled）アイテムの改変は防ぐ（精算済の操作は別途 精算済ページの機能で扱う）。
    const existing = await db
      .select({ id: item.id })
      .from(item)
      .where(
        and(eq(item.id, itemId), eq(item.groupId, member.groupId), eq(item.status, "unsettled")),
      )
      .get();
    if (!existing) {
      return c.json({ error: "Not Found" }, 404);
    }

    // batch は逐次実行されるため、子テーブルの全削除を先に、再挿入を後に置く。
    // 合計 > 0 を満たすため payments / shares はいずれも 1 件以上で、空配列 insert にはならない。
    await db.batch([
      db
        .update(item)
        .set({
          name,
          purchasedOn: purchasedOn ? new Date(purchasedOn) : null,
          memo: memo ?? null,
          updatedAt: new Date(),
        })
        .where(eq(item.id, itemId)),
      db.delete(itemPayment).where(eq(itemPayment.itemId, itemId)),
      db.delete(itemShare).where(eq(itemShare.itemId, itemId)),
      db.insert(itemPayment).values(makeRows(itemId, payments)),
      db.insert(itemShare).values(makeRows(itemId, shares)),
    ]);

    return c.json({ id: itemId });
  })
  // 購入品を削除する。削除は未精算アイテムのみ可（精算済アイテムは別途 精算済ページの機能で扱う）。
  // item_payment / item_share は外部キー CASCADE で消える（groups と同方針）。
  .delete("/:groupId/items/:itemId", async (c) => {
    const member = c.get("groupMember");
    const db = c.get("db");
    const itemId = c.req.param("itemId");

    const deleted = await db
      .delete(item)
      .where(
        and(eq(item.id, itemId), eq(item.groupId, member.groupId), eq(item.status, "unsettled")),
      )
      .returning({ id: item.id });
    if (deleted.length === 0) {
      return c.json({ error: "Not Found" }, 404);
    }

    return c.json({ deleted: true });
  })
  // 精算を実行する（Issue #22）。選択された未精算アイテムを settled に一括更新する。
  // groupId 一致かつ status = "unsettled" の id だけを対象にし、他グループや精算済の巻き込みを防ぐ。
  // 実際に更新できた id を返す（存在しない / 既に精算済の id は黙って無視される）。
  .post(
    "/:groupId/settlements",
    zValidator("json", z.object({ itemIds: z.array(z.string().min(1)).min(1) })),
    async (c) => {
      const member = c.get("groupMember");
      const db = c.get("db");
      const { itemIds } = c.req.valid("json");

      const settled = await db
        .update(item)
        .set({ status: "settled", updatedAt: new Date() })
        .where(
          and(
            eq(item.groupId, member.groupId),
            eq(item.status, "unsettled"),
            inArray(item.id, itemIds),
          ),
        )
        .returning({ id: item.id });

      return c.json({ settled: settled.map((r) => r.id) });
    },
  );
