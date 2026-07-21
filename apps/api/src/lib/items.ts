import { type AmountEntry, sumAmount, validateAmounts } from "@warikan/domain";
import { eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { DbVariables } from "../context";
import { groupMember, item } from "../db/schema";

// 購入品ルート（routes/items.ts）から切り出した関数群。
// DB・Hono コンテキストに依存しない純粋関数に加え、POST/PUT・GET 間で重複していた
// 検証・レスポンス整形ロジックもここに集約し、単体テスト可能にする。
// 金額行の形・整合性検証（validateAmounts / sumAmount）は domain（信頼の単一ソース、ADR-0013）を使う。

// itemId をキーに金額行をまとめる（一覧で item ごとの payments/shares を組み立てる用）。
export function groupByItem<T extends { itemId: string } & AmountEntry>(rows: T[]) {
  const map = new Map<string, AmountEntry[]>();
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
export const makeRows = (itemId: string, entries: AmountEntry[]) =>
  entries.map((e) => ({ itemId, ...e }));

// 当該グループの全メンバー userId 集合を返す（payments/shares の userId 検証用）。
export async function groupMemberIds(db: DbVariables["db"], groupId: string): Promise<Set<string>> {
  const rows = await db
    .select({ userId: groupMember.userId })
    .from(groupMember)
    .where(eq(groupMember.groupId, groupId));
  return new Set(rows.map((m) => m.userId));
}

// 購入品の保存(POST)・更新(PUT)で共通の入力検証（金額の整合性 + payments/shares の
// userId が当該グループのメンバーであること）。問題があれば { error, status } を、
// なければ null を返す。
export async function validateItemInput(
  db: DbVariables["db"],
  groupId: string,
  { payments, shares }: { payments: AmountEntry[]; shares: AmountEntry[] },
): Promise<{ error: string; status: 400 } | null> {
  const amountError = validateAmounts(payments, shares);
  if (amountError) {
    return { error: amountError, status: 400 };
  }

  // 他グループや非メンバーの userId 混入を防ぐ。
  const memberIds = await groupMemberIds(db, groupId);
  const allUserIds = [...payments, ...shares].map((e) => e.userId);
  if (allUserIds.some((id) => !memberIds.has(id))) {
    return { error: "グループに属さないメンバーが含まれています", status: 400 };
  }

  return null;
}

type ItemRow = Pick<
  InferSelectModel<typeof item>,
  "id" | "name" | "purchasedOn" | "memo" | "status"
>;

// item 行 + payments/shares から API レスポンス用の item オブジェクトを組み立てる
//（GET 一覧・GET 単一で共通）。purchasedOn は null 変換、total は支払額合計（Issue #19）。
export function toItemResponse(row: ItemRow, payments: AmountEntry[], shares: AmountEntry[]) {
  return {
    id: row.id,
    name: row.name,
    purchasedOn: row.purchasedOn ? row.purchasedOn.toISOString() : null,
    memo: row.memo,
    status: row.status,
    total: sumAmount(payments),
    payments,
    shares,
  };
}
