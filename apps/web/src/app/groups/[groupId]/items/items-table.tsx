import type { ReactNode } from "react";

// 一覧テーブルの行に必要な最小限のアイテム情報。
export type ItemRowData = {
  id: string;
  name: string;
  purchasedOn: string | null;
  total: number;
};

type Props = {
  items: ItemRowData[];
  // 選択列（チェックボックス）。未精算ビューのみ使用（送金計算・精算の対象選択）。
  selectable?: { selected: Set<string>; onToggle: (itemId: string) => void };
  // 操作列の中身はビューごとに異なる（未精算: 編集・削除 / 精算済: 編集・未精算に戻す・削除）。
  renderActions: (item: ItemRowData) => ReactNode;
};

// 未精算・精算済の両ビューで共有するアイテム一覧テーブル（Issue #23: 見た目の共通化）。
export function ItemsTable({ items, selectable, renderActions }: Props) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left text-zinc-500">
          {selectable && <th className="w-8 py-2" aria-label="選択" />}
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
