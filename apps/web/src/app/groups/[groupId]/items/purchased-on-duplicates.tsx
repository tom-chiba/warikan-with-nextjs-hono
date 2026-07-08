"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { formatAmount } from "@/lib/format";
import { itemsOnDateKeys } from "@/lib/query-keys";

// 購入日入力時の「これってもう入れたっけ？」確認表示。
// 指定された購入日（YYYY-MM-DD）に入力済みのアイテム（未精算＋精算済を横断）を取得し、
// 1 件以上あれば控えめな注記として一覧する。0 件なら何も描画しない。
// 取得はこのコンポーネントに閉じ、購入日が選ばれているときだけマウントされる前提
// （ItemForm 本体に依存・リクエストを持たせず、初期表示を軽く保つため）。
type PurchasedOnDuplicatesProps = {
  groupId: string;
  // 確認対象の購入日（input type="date" の値、"YYYY-MM-DD"）。
  purchasedOn: string;
  // 編集中のアイテム自身を一覧から除外する（編集ページで自分自身が重複として出ないように）。
  excludeItemId?: string;
};

export function PurchasedOnDuplicates({
  groupId,
  purchasedOn,
  excludeItemId,
}: PurchasedOnDuplicatesProps) {
  const { data, isError } = useQuery({
    queryKey: itemsOnDateKeys.detail(groupId, purchasedOn),
    enabled: !!purchasedOn,
    // 「もう入れたっけ？」の確認は最新の真実が要る。Provider 既定の staleTime（60s）を打ち消し、
    // 購入日を選ぶ／変えるたびに必ず取得し直す（直前の連続入力で増えた分も取りこぼさない）。
    staleTime: 0,
    queryFn: async () => {
      const res = await apiClient.groups[":groupId"].items.$get({
        param: { groupId },
        query: { purchasedOn },
      });
      if (!res.ok) {
        throw new Error("入力済みアイテムの取得に失敗しました");
      }
      return res.json();
    },
  });

  // 取得に失敗したときは「0 件」と区別できるよう控えめに知らせる。無表示だと
  //「この日は未入力」と誤認させ、重複確認の役目を果たせない（取得失敗 ≠ 入力なし）。
  if (isError) {
    return <p className="note-muted">この日の入力済みを確認できませんでした。</p>;
  }

  const items = (data?.items ?? []).filter((i) => i.id !== excludeItemId);

  // 取得前・0 件のときは何も出さない（確認の邪魔をしない）。
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-rule px-3 py-2 text-sm">
      <p className="font-bold text-warn">この日に入力済み（{items.length}件）</p>
      <ul className="mt-1 flex flex-col gap-0.5 text-muted">
        {items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3">
            <span className="truncate text-ink">{i.name}</span>
            <span className="shrink-0 tabular-nums text-ink">{formatAmount(i.total)} 円</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
