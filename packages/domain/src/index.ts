// 割り勘ドメインの計算ロジック（ADR-0013）。
// FE（表示・即時計算）と BE（精算確定時の検証）の両方から参照される信頼の単一ソース。
// 依存ゼロの純粋関数のみを置き、クイック入力画面のバンドルサイズへ影響させないこと。
export { amountsBalanced, sumAmount, validateAmounts } from "./amounts";
export { MEMO_MAX_LENGTH, NAME_MAX_LENGTH } from "./limits";
export { distributeEqually } from "./split";
export {
  type AmountEntry,
  computeBalances,
  computeSettlements,
  type ItemKind,
  minimizeTransfers,
  type SettlementItem,
  type Transfer,
  transfersEqual,
} from "./settle";
