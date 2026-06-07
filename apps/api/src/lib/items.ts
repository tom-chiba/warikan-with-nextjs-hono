import type { Transfer } from "@warikan/domain";

// 購入品ルート（routes/items.ts）から切り出した純粋関数群。
// DB・Hono コンテキストに依存しないロジックをここに集め、単体テスト可能にする。

export type AmountRow = { userId: string; amount: number };

export const sumAmount = (entries: { amount: number }[]) =>
  entries.reduce((acc, e) => acc + e.amount, 0);

const hasDuplicateUser = (entries: { userId: string }[]) =>
  new Set(entries.map((e) => e.userId)).size !== entries.length;

// 割勘の整合性チェック（支払額合計 = 割勘金額合計・合計 > 0・同一メンバー重複なし）。
// 問題があればエラーメッセージ、なければ null を返す。POST/PUT で共通。
export function validateAmounts(payments: AmountRow[], shares: AmountRow[]) {
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

// クライアントが確認した送金リストとサーバー側の再計算結果の完全一致を判定する。
// computeSettlements() は入力順序に依存せず決定的（同額時は userId 順で安定）なため、
// 同じデータからは必ず同じ配列が得られ、順序込みの単純比較で検証できる（ADR-0013）。
export function transfersEqual(a: Transfer[], b: Transfer[]) {
  return (
    a.length === b.length &&
    a.every((t, i) => t.from === b[i].from && t.to === b[i].to && t.amount === b[i].amount)
  );
}

// itemId をキーに金額行をまとめる（一覧で item ごとの payments/shares を組み立てる用）。
export function groupByItem<T extends { itemId: string } & AmountRow>(rows: T[]) {
  const map = new Map<string, AmountRow[]>();
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
export const makeRows = (itemId: string, entries: AmountRow[]) =>
  entries.map((e) => ({ itemId, ...e }));
