import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
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

// 購入品保存の入力。purchasedOn は input type="date" の値（"YYYY-MM-DD"）。
// 購入日・メモは任意（未入力なら null 相当）。
const createItemSchema = z.object({
  name: z.string().trim().min(1).max(100),
  purchasedOn: z.iso.date().nullish(),
  memo: z.string().max(500).nullish(),
  payments: z.array(amountEntry),
  shares: z.array(amountEntry),
});

const sumAmount = (entries: { amount: number }[]) => entries.reduce((acc, e) => acc + e.amount, 0);

const hasDuplicateUser = (entries: { userId: string }[]) =>
  new Set(entries.map((e) => e.userId)).size !== entries.length;

// /groups/:groupId 配下の保護ルート（当該グループのメンバー限定）。
// 認可ミドルウェア（requireAuth / provideDb / requireGroupMember）は index.ts 側でマウントするため、
// ここでは Bindings(Env) を持たず Variables だけ型付けする。これにより rpc.ts の AppType に
// Workers 固有型が混入せず、フロントエンドが型解決できる状態を保てる（ADR-0009 / ADR-0010）。
export const items = new Hono<{
  Variables: GroupMemberVariables & DbVariables;
}>().post("/:groupId/items", zValidator("json", createItemSchema), async (c) => {
  const member = c.get("groupMember");
  const db = c.get("db");
  const { name, purchasedOn, memo, payments, shares } = c.req.valid("json");

  // 割勘の整合性: 支払額合計 = 割勘金額合計 かつ合計 > 0 でなければ保存しない。
  const paymentTotal = sumAmount(payments);
  const shareTotal = sumAmount(shares);
  if (paymentTotal === 0 || paymentTotal !== shareTotal) {
    return c.json({ error: "支払額合計と割勘金額合計が一致していません" }, 400);
  }

  // 同一メンバーの重複行は複合主キー違反・二重計上の原因になるため拒否する。
  if (hasDuplicateUser(payments) || hasDuplicateUser(shares)) {
    return c.json({ error: "同一メンバーが重複しています" }, 400);
  }

  // payments / shares の全 userId が当該グループのメンバーであることを検証する
  //（他グループや非メンバーの userId 混入を防ぐ）。
  const memberRows = await db
    .select({ userId: groupMember.userId })
    .from(groupMember)
    .where(eq(groupMember.groupId, member.groupId));
  const memberIds = new Set(memberRows.map((m) => m.userId));
  const allUserIds = [...payments, ...shares].map((e) => e.userId);
  if (allUserIds.some((id) => !memberIds.has(id))) {
    return c.json({ error: "グループに属さないメンバーが含まれています" }, 400);
  }

  // item + item_payment + item_share を db.batch()（D1 の暗黙の SQL トランザクション = all-or-nothing）で
  // 原子的に作成する。id は JS 側で確定させ子テーブルと共有する。status は既定の "unsettled"（未精算）。
  // D1 は対話的トランザクション（db.transaction()）非対応のため batch を用いる（groups-collection と同方針）。
  // 合計 > 0 を満たすため payments / shares はいずれも 1 件以上で、空配列 insert にはならない。
  const id = crypto.randomUUID();
  const toRows = (entries: { userId: string; amount: number }[]) =>
    entries.map((e) => ({ itemId: id, ...e }));
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
    db.insert(itemPayment).values(toRows(payments)),
    db.insert(itemShare).values(toRows(shares)),
  ]);

  return c.json({ id }, 201);
});
