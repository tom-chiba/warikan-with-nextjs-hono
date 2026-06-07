"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { computeSettlements } from "@warikan/domain";
import { useGroupMembers } from "@/lib/use-group-members";
import { ItemsTable } from "./items-table";
import { useItemActions } from "./use-item-actions";

// 未精算ビュー（#19〜#22）。一覧表示・編集削除・送金計算・精算実行を担う。
// セッション確認は親（items-page-inner）で済んでいる前提。
export function UnsettledView({ groupId }: { groupId: string }) {
  const queryClient = useQueryClient();
  const { busy, error, run, deleteItem } = useItemActions(groupId, "unsettled");

  // 選択中のアイテム id。複数選択 → 送金計算（#21）・精算実行（#22）の対象。
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 未精算アイテム一覧（#19）。各 item に合計金額・payments・shares を含む。
  const { data: itemsData, error: fetchError } = useQuery({
    queryKey: ["items", groupId, "unsettled"],
    queryFn: async () => {
      const res = await apiClient.groups[":groupId"].items.$get({
        param: { groupId },
        query: { status: "unsettled" },
      });
      if (!res.ok) {
        throw new Error("未精算アイテムの取得に失敗しました");
      }
      return res.json();
    },
  });

  // メンバー一覧（送金リストの表示名解決用）。
  const { data: membersData } = useGroupMembers(groupId, true);

  const items = itemsData?.items ?? [];
  const members = membersData?.members ?? [];
  // userId → 表示名の索引。送金リストの行ごとに members を線形探索しないよう一度だけ構築する。
  const nameById = useMemo(() => new Map(members.map((m) => [m.userId, m.name])), [members]);
  const nameOf = (userId: string) => nameById.get(userId) ?? userId;

  // 選択中かつ一覧に存在するアイテムだけを対象に送金リストを算出する
  //（削除・精算で一覧から消えた id を取り残さない）。
  // busy / error などの再描画では再計算しないよう items / selected に依存させる。
  const selectedItems = useMemo(() => items.filter((i) => selected.has(i.id)), [items, selected]);
  const transfers = useMemo(() => computeSettlements(selectedItems), [selectedItems]);

  function toggle(itemId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  // ヘッダーの全選択チェックボックス用（#49）。一覧の全件が選択済みかどうかで表示と
  // トグル方向（全選択 / 全解除）を決める。items は十分小さい想定なので毎レンダー算出で足りる。
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));

  function toggleAll() {
    // toggle と同じく関数型更新で常に最新の選択状態からトグル方向を決める。
    setSelected((prev) => {
      const all = items.length > 0 && items.every((i) => prev.has(i.id));
      return all ? new Set<string>() : new Set(items.map((i) => i.id));
    });
  }

  function handleDelete(itemId: string, name: string) {
    // 削除確定後は選択セットからも除去する（送金計算に取り残さない）。
    return deleteItem(itemId, name, () => {
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    });
  }

  async function handleSettle() {
    const itemIds = selectedItems.map((i) => i.id);
    if (itemIds.length === 0) {
      return;
    }
    if (!window.confirm(`選択した ${itemIds.length} 件を精算済にします。よろしいですか？`)) {
      return;
    }
    await run(async () => {
      const res = await apiClient.groups[":groupId"].settlements.$post({
        param: { groupId },
        json: { itemIds },
      });
      if (!res.ok) {
        throw new Error("精算に失敗しました");
      }
      // 精算でアイテムが未精算 → 精算済へ移動するため、両一覧のキャッシュを無効化する
      //（前方一致で "unsettled" / "settled" の両キーが対象になる）。
      // サーバは groupId 一致かつ未精算の id のみ更新する。0 件なら（既に精算済・削除済等で）
      // 一覧が古い可能性が高いので、先に最新化してから警告する。
      const { settled } = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["items", groupId] });
      if (settled.length === 0) {
        throw new Error("精算対象がありませんでした（既に精算済みか削除済みの可能性があります）");
      }
      setSelected(new Set());
    }, "精算に失敗しました");
  }

  return (
    <>
      {(error || fetchError) && (
        <p className="w-full max-w-2xl text-sm text-red-500">
          {error ??
            (fetchError instanceof Error
              ? fetchError.message
              : "未精算アイテムの取得に失敗しました")}
        </p>
      )}

      <section className="flex w-full max-w-2xl flex-col gap-3">
        {items.length === 0 ? (
          <p className="text-sm text-zinc-500">未精算のアイテムはありません。</p>
        ) : (
          <ItemsTable
            items={items}
            selectable={{ selected, onToggle: toggle, onToggleAll: toggleAll, allSelected }}
            renderActions={(item) => (
              <>
                <Link
                  href={`/groups/${groupId}/items/${item.id}/edit`}
                  className="rounded-md border px-3 py-1 text-xs"
                >
                  編集
                </Link>
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

      {/* 選択 → 送金リスト（#21）と精算実行（#22）。 */}
      {selectedItems.length > 0 && (
        <section className="flex w-full max-w-2xl flex-col gap-3">
          <h2 className="text-lg font-medium">送金リスト（選択 {selectedItems.length} 件）</h2>
          {transfers.length === 0 ? (
            <p className="text-sm text-zinc-500">
              選択分の収支はすでに均衡しています（送金は不要です）。
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {transfers.map((t) => (
                <li
                  key={`${t.from}->${t.to}`}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <span>
                    {nameOf(t.from)} → {nameOf(t.to)}
                  </span>
                  <span className="font-medium">{t.amount} 円</span>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={handleSettle}
            className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            選択した {selectedItems.length} 件を精算する
          </button>
        </section>
      )}
    </>
  );
}
