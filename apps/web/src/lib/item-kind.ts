import type { ItemKind } from "@warikan/domain";

// 見出し文言で使う kind の呼び名（「◯◯を入力」「◯◯を編集」等）。
export function itemKindNoun(kind: ItemKind): "収入" | "購入品" {
  return kind === "income" ? "収入" : "購入品";
}
