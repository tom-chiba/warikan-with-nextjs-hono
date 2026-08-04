// 割り勘金額の整合性ルール（ADR-0013）。
// FE（保存可否の即時判定）と BE（保存・更新時の検証）の両方から参照する信頼の単一ソース。
// 依存ゼロの純粋関数のみを置き、クイック入力画面のバンドルサイズへ影響させないこと。

import type { AmountEntry } from "./settle";

// 金額行（{ amount }）の合算。空配列は 0。
export const sumAmount = (entries: { amount: number }[]): number =>
  entries.reduce((acc, e) => acc + e.amount, 0);

// 金額整合性の真偽判定（メッセージを持たない純粋述語）。
// 「支払額合計 > 0（空の購入品は保存しない）」かつ「支払額合計 = 割勘金額合計」。
// FE の保存可否（canSubmit）と BE の検証メッセージ生成（validateAmounts）が共有する。
export const amountsBalanced = (paymentTotal: number, shareTotal: number): boolean =>
  paymentTotal > 0 && paymentTotal === shareTotal;

// 同一メンバーが複数行に現れていないか（BE 側の検証で使う）。
const hasDuplicateUser = (entries: { userId: string }[]): boolean =>
  new Set(entries.map((e) => e.userId)).size !== entries.length;

// 割勘の整合性チェック（支払額合計 = 割勘金額合計・合計 > 0・同一メンバー重複なし）。
// 問題があればエラーメッセージ、なければ null を返す（BE の POST/PUT で共通）。
export function validateAmounts(payments: AmountEntry[], shares: AmountEntry[]): string | null {
  if (!amountsBalanced(sumAmount(payments), sumAmount(shares))) {
    return "支払額合計と割勘金額合計が一致していません";
  }
  if (hasDuplicateUser(payments) || hasDuplicateUser(shares)) {
    return "同一メンバーが重複しています";
  }
  return null;
}
