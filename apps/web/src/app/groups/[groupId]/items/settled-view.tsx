"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { itemKeys } from "@/lib/query-keys";
import { ItemsTable } from "./items-table";
import { useItemActions } from "./use-item-actions";

// 精算済ビュー（#23・#24）。一覧表示と、各行の編集・未精算に戻す・削除を担う。
// セッション確認は親（items-page-inner）で済んでいる前提。
export function SettledView({ groupId }: { groupId: string }) {
  const queryClient = useQueryClient();
  const { busy, error, run, deleteItem } = useItemActions(groupId, "settled");

  // 精算済アイテム一覧（#23）。
  const { data: itemsData, error: fetchError } = useQuery({
    queryKey: itemKeys.list(groupId, "settled"),
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

  // 未精算に戻す（#24）。
  async function handleUnsettle(itemId: string, name: string) {
    if (!window.confirm(`「${name}」を未精算に戻しますか？`)) {
      return;
    }
    await run(async () => {
      const res = await apiClient.groups[":groupId"].unsettlements.$post({
        param: { groupId },
        json: { itemIds: [itemId] },
      });
      if (!res.ok) {
        throw new Error("未精算に戻す処理に失敗しました");
      }
      // 戻すとアイテムが精算済 → 未精算へ移動するため、両一覧のキャッシュを無効化する
      //（前方一致で "unsettled" / "settled" の両キーが対象になる）。
      // サーバは groupId 一致かつ精算済の id のみ更新する。0 件なら（既に戻された・削除済等で）
      // 一覧が古い可能性が高いので、先に最新化してから警告する（精算実行と同方針）。
      const { unsettled } = await res.json();
      await queryClient.invalidateQueries({ queryKey: itemKeys.byGroup(groupId) });
      if (unsettled.length === 0) {
        throw new Error(
          "対象がありませんでした（既に未精算に戻されたか削除済みの可能性があります）",
        );
      }
    }, "未精算に戻す処理に失敗しました");
  }

  return (
    <>
      {(error || fetchError) && (
        <p className="note-danger w-full">
          {error ??
            (fetchError instanceof Error
              ? fetchError.message
              : "精算済アイテムの取得に失敗しました")}
        </p>
      )}

      <section className="flex w-full flex-col gap-3">
        {items.length === 0 ? (
          <p className="note-muted">精算済のアイテムはありません。</p>
        ) : (
          <ItemsTable
            items={items}
            renderActions={(item) => (
              <>
                <Link
                  href={`/groups/${groupId}/items/${item.id}/edit?from=settled`}
                  className="btn btn-line btn-sm"
                >
                  編集
                </Link>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleUnsettle(item.id, item.name)}
                  className="btn btn-line btn-sm"
                >
                  未精算に戻す
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => deleteItem(item.id, item.name)}
                  className="btn btn-line-danger btn-sm"
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
