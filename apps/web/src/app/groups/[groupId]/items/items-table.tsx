"use client";

import type { ReactNode } from "react";
import { IndeterminateCheckbox } from "./indeterminate-checkbox";

// 一覧テーブルの行に必要な最小限のアイテム情報。
export type ItemRowData = {
  id: string;
  name: string;
  purchasedOn: string | null;
  total: number;
};

// 選択列（チェックボックス）。未精算ビューのみ使用（送金計算・精算の対象選択）。
// allSelected はトグル方向の決定にも使うため、選択ロジックを持つビュー側で算出して渡す。
type Selectable = {
  selected: Set<string>;
  onToggle: (itemId: string) => void;
  // ヘッダーの全選択チェックボックス（Issue #49）。全件選択済みなら全解除、それ以外は全選択。
  onToggleAll: () => void;
  allSelected: boolean;
};

type Props = {
  items: ItemRowData[];
  selectable?: Selectable;
  // 操作列の中身はビューごとに異なる（未精算: 編集・削除 / 精算済: 編集・未精算に戻す・削除）。
  renderActions: (item: ItemRowData) => ReactNode;
};

// 未精算・精算済の両ビューで共有するアイテム一覧テーブル（Issue #23: 見た目の共通化）。
export function ItemsTable({ items, selectable, renderActions }: Props) {
  // 一部選択（indeterminate 表示）の判定。selected に一覧外の id が残っていても
  // 影響を受けないよう、表示中の items を基準に導出する。
  const someSelected = !!selectable && items.some((i) => selectable.selected.has(i.id));
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left text-zinc-500">
          {selectable && (
            <th className="w-8 py-2">
              <IndeterminateCheckbox
                checked={selectable.allSelected}
                indeterminate={someSelected && !selectable.allSelected}
                onChange={selectable.onToggleAll}
                aria-label="全て選択"
              />
            </th>
          )}
          <th className="py-2">購入品名</th>
          <th className="py-2">購入日</th>
          <th className="py-2 text-right">合計金額</th>
          <th className="py-2 text-right">操作</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id} className="border-b">
            {selectable && (
              <td className="py-2">
                <input
                  type="checkbox"
                  aria-label={`${item.name} を選択`}
                  checked={selectable.selected.has(item.id)}
                  onChange={() => selectable.onToggle(item.id)}
                />
              </td>
            )}
            <td className="py-2">{item.name}</td>
            <td className="py-2">{item.purchasedOn ? item.purchasedOn.slice(0, 10) : "—"}</td>
            <td className="py-2 text-right">{item.total} 円</td>
            <td className="py-2 text-right">
              <span className="flex justify-end gap-2">{renderActions(item)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
