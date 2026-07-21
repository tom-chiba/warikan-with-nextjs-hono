// 入力欄の長さ上限（文字数）。FE のフォーム（maxLength）と BE の zod スキーマ（.max）が
// 同じ値を参照するための信頼の単一ソース（ADR-0013）。依存ゼロの定数のみを置く。

// 名前系フィールド（購入品名・グループ名・メンバー表示名）の最大文字数。
export const NAME_MAX_LENGTH = 100;

// メモ（購入品の補足）の最大文字数。
export const MEMO_MAX_LENGTH = 500;
