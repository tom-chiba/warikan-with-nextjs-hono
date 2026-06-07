import type { AmountEntry } from "@warikan/domain";

// 購入品ルート（routes/items.ts）から切り出した純粋関数群。
// DB・Hono コンテキストに依存しないロジックをここに集め、単体テスト可能にする。
// 金額行の形は domain の AmountEntry（{ userId, amount }）を信頼の単一ソースとして使う。

export const sumAmount = (entries: { amount: number }[]) =>
  entries.reduce((acc, e) => acc + e.amount, 0);

const hasDuplicateUser = (entries: { userId: string }[]) =>
  new Set(entries.map((e) => e.userId)).size !== entries.length;

// 割勘の整合性チェック（支払額合計 = 割勘金額合計・合計 > 0・同一メンバー重複なし）。
// 問題があればエラーメッセージ、なければ null を返す。POST/PUT で共通。
export function validateAmounts(payments: AmountEntry[], shares: AmountEntry[]) {
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
