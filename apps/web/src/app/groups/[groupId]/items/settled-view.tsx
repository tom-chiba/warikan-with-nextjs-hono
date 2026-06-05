"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { apiClient } from "@/lib/api-client";
import { ItemsTable } from "./items-table";

// 精算済ビュー（#23・#24）。一覧表示と、各行の編集・未精算に戻す・削除を担う。
// セッション確認は親（items-page-inner）で済んでいる前提。
export function SettledView({ groupId }: { groupId: string }) {
  const queryClient = useQueryClient();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 精算済アイテム一覧（#23）。
  const { data: itemsData, error: fetchError } = useQuery({
    queryKey: ["items", groupId, "settled"],
    queryFn: async () => {
      const res = await apiClient.groups[":groupId"].items.$get({
        param: { groupId },
        query: { status: "settled" },
      });
      if (!res.ok) {
        throw new Error("精算済アイテムの取得に失敗しました");
      }
      return res.json();
    },
  });

  const items = itemsData?.items ?? [];

  // 未精算に戻す（#24）。サーバは groupId 一致かつ精算済の id のみ更新するため、
  // 0 件なら（既に戻された・削除済等で）警告する（精算実行と同方針）。
  async function handleUnsettle(itemId: string, name: string) {
    if (!window.confirm(`「${name}」を未精算に戻しますか？`)) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await apiClient.groups[":groupId"].unsettlements.$post({
        param: { groupId },
        json: { itemIds: [itemId] },
      });
      if (!res.ok) {
        throw new Error("未精算に戻す処理に失敗しました");
      }
      const { unsettled } = await res.json();
      if (unsettled.length === 0) {
        throw new Error(
          "対象がありませんでした（既に未精算に戻されたか削除済みの可能性があります）",
        );
      }
      // 戻すとアイテムが精算済 → 未精算へ移動するため、両一覧のキャッシュを無効化する。
      await queryClient.invalidateQueries({ queryKey: ["items", groupId, "settled"] });
      await queryClient.invalidateQueries({ queryKey: ["items", groupId, "unsettled"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "未精算に戻す処理に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(itemId: string, name: string) {
    if (!window.confirm(`「${name}」を削除しますか？`)) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await apiClient.groups[":groupId"].items[":itemId"].$delete({
        param: { groupId, itemId },
      });
      if (!res.ok) {
        throw new Error("アイテムの削除に失敗しました");
      }
      await queryClient.invalidateQueries({ queryKey: ["items", groupId, "settled"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "アイテムの削除に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {(error || fetchError) && (
        <p className="w-full max-w-2xl text-sm text-red-500">
          {error ??
            (fetchError instanceof Error
              ? fetchError.message
              : "精算済アイテムの取得に失敗しました")}
        </p>
      )}

      <section className="flex w-full max-w-2xl flex-col gap-3">
        {items.length === 0 ? (
          <p className="text-sm text-zinc-500">精算済のアイテムはありません。</p>
        ) : (
          <ItemsTable
            items={items}
            renderActions={(item) => (
              <>
                <Link
                  href={`/groups/${groupId}/items/${item.id}/edit?from=settled`}
                  className="rounded-md border px-3 py-1 text-xs"
                >
                  編集
                </Link>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleUnsettle(item.id, item.name)}
                  className="rounded-md border px-3 py-1 text-xs disabled:opacity-50"
                >
                  未精算に戻す
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDelete(item.id, item.name)}
                  className="rounded-md border px-3 py-1 text-xs text-red-600 disabled:opacity-50"
                >
                  削除
                </button>
              </>
            )}
          />
        )}
      </section>
    </>
  );
}
