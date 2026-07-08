"use client";

import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { SESSION_EXPIRED_MESSAGE } from "@/lib/auth-error";
import { itemsOnDateKeys } from "@/lib/query-keys";
import type { ItemFormValues } from "./item-form";

// 購入品の保存処理（メイン機能）。ルートのクイック入力（quick-item-entry）と
// /groups/[groupId]/items/new の両画面で共有する。ItemForm の onSubmit に渡す保存関数を返す。
// コンポーネントは文脈が異なるため統合せず、保存ロジックだけをここに集約する（#126）。
export function useCreateItem(groupId: string) {
  const queryClient = useQueryClient();

  return async function createItem(values: ItemFormValues) {
    const res = await apiClient.groups[":groupId"].items.$post({
      param: { groupId },
      json: values,
    });
    if (!res.ok) {
      const status: number = res.status;
      throw new Error(status === 401 ? SESSION_EXPIRED_MESSAGE : "購入品の保存に失敗しました");
    }
    // 連続入力では保存後も購入日が今日のまま維持され、PurchasedOnDuplicates が同じキーで
    // マウントされ続けるため放置すると重複ヒントが保存前のままになる。当該日のクエリを無効化して
    // 今入れたアイテムを反映させる（日付別に複数キーがありうるので groupId 前方一致で無効化）。
    await queryClient.invalidateQueries({ queryKey: itemsOnDateKeys.byGroup(groupId) });
  };
}
