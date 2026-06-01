"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { SessionPending, SignInPrompt } from "@/components/session-states";
import { apiClient } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";
import { computeSettlements } from "@/lib/settle";
import { useGroupMembers } from "@/lib/use-group-members";

export default function UnsettledItemsPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;
  const { data: session, isPending } = useSession();
  const queryClient = useQueryClient();

  // 選択中のアイテム id。複数選択 → 送金計算（#21）・精算実行（#22）の対象。
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 未精算アイテム一覧（#19）。各 item に合計金額・payments・shares を含む。
  const { data: itemsData, error: fetchError } = useQuery({
    queryKey: ["items", groupId, "unsettled"],
    enabled: !!session,
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
  const { data: membersData } = useGroupMembers(groupId, !!session);

  if (isPending) {
    return <SessionPending />;
  }

  if (!session) {
    return <SignInPrompt />;
  }

  const items = itemsData?.items ?? [];
  const members = membersData?.members ?? [];
  const nameOf = (userId: string) => members.find((m) => m.userId === userId)?.name ?? userId;

  // 選択中かつ一覧に存在するアイテムだけを対象に送金リストを算出する
  //（削除・精算で一覧から消えた id を取り残さない）。
  const selectedItems = items.filter((i) => selected.has(i.id));
  const transfers = computeSettlements(selectedItems);

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
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["items", groupId, "unsettled"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "アイテムの削除に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function handleSettle() {
    const itemIds = selectedItems.map((i) => i.id);
    if (itemIds.length === 0) {
      return;
    }
    if (!window.confirm(`選択した ${itemIds.length} 件を精算済にします。よろしいですか？`)) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await apiClient.groups[":groupId"].settlements.$post({
        param: { groupId },
        json: { itemIds },
      });
      if (!res.ok) {
        throw new Error("精算に失敗しました");
      }
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: ["items", groupId, "unsettled"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "精算に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center gap-8 p-8">
      <h1 className="text-2xl font-semibold">未精算アイテム</h1>

      <div className="flex gap-2">
        <Link
          href={`/groups/${groupId}/items/new`}
          className="rounded-md bg-black px-4 py-2 text-white dark:bg-white dark:text-black"
        >
          購入品を入力
        </Link>
        <Link href={`/groups/${groupId}`} className="rounded-md border px-4 py-2">
          グループへ戻る
        </Link>
      </div>

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
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-zinc-500">
                <th className="w-8 py-2" aria-label="選択" />
                <th className="py-2">購入品名</th>
                <th className="py-2">購入日</th>
                <th className="py-2 text-right">合計金額</th>
                <th className="py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b">
                  <td className="py-2">
                    <input
                      type="checkbox"
                      aria-label={`${item.name} を選択`}
                      checked={selected.has(item.id)}
                      onChange={() => toggle(item.id)}
                    />
                  </td>
                  <td className="py-2">{item.name}</td>
                  <td className="py-2">{item.purchasedOn ? item.purchasedOn.slice(0, 10) : "—"}</td>
                  <td className="py-2 text-right">{item.total} 円</td>
                  <td className="py-2 text-right">
                    <span className="flex justify-end gap-2">
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
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    </main>
  );
}
