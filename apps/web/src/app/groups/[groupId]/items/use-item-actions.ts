"use client";

import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { itemKeys } from "@/lib/query-keys";
import { useAsyncAction } from "@/lib/use-async-action";

// 未精算・精算済の両ビューで共有するミューテーション基盤。
// busy / error の管理は useAsyncAction に委ね、両ビューで同一の削除処理をここに集約する。
export function useItemActions(groupId: string, status: "unsettled" | "settled") {
  const queryClient = useQueryClient();
  const { busy, error, run } = useAsyncAction();

  // アイテム削除（確認 → DELETE → 当該ビューの一覧を無効化）。
  // onDeleted は削除確定後のビュー固有処理（未精算ビューの選択解除など）。
  async function deleteItem(itemId: string, name: string, onDeleted?: () => void) {
    if (!window.confirm(`「${name}」を削除しますか？`)) {
      return;
    }
    await run(async () => {
      const res = await apiClient.groups[":groupId"].items[":itemId"].$delete({
        param: { groupId, itemId },
      });
      if (!res.ok) {
        throw new Error("アイテムの削除に失敗しました");
      }
      onDeleted?.();
      await queryClient.invalidateQueries({ queryKey: itemKeys.list(groupId, status) });
    }, "アイテムの削除に失敗しました");
  }

  return { busy, error, run, deleteItem };
}
