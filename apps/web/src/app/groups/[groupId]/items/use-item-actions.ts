"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiClient } from "@/lib/api-client";

// 未精算・精算済の両ビューで共有するミューテーション基盤。
// busy / error の管理と、両ビューで同一の削除処理をここに集約する。
export function useItemActions(groupId: string, status: "unsettled" | "settled") {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // busy 管理とエラー集約の共通骨格。action が throw したメッセージを画面に表示する。
  async function run(action: () => Promise<void>, fallbackMessage: string) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallbackMessage);
    } finally {
      setBusy(false);
    }
  }

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
      await queryClient.invalidateQueries({ queryKey: ["items", groupId, status] });
    }, "アイテムの削除に失敗しました");
  }

  return { busy, error, run, deleteItem };
}
