"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { computeSettlements } from "@warikan/domain";
import { itemKeys } from "@/lib/query-keys";
import { useGroupMembers } from "@/lib/use-group-members";
import { ItemsTable } from "./items-table";
import { SettlementBar, SettlementSheet, type TransferRow } from "./settlement-panel";
import { useItemActions } from "./use-item-actions";

// 未精算ビュー（#19〜#22）。一覧表示・編集削除・送金計算・精算実行を担う。
// セッション確認は親（items-page-inner）で済んでいる前提。
export function UnsettledView({ groupId }: { groupId: string }) {
  const queryClient = useQueryClient();
  const { busy, error, run, deleteItem } = useItemActions(groupId, "unsettled");

  // 選択中のアイテム id。複数選択 → 送金計算（#21）・精算実行（#22）の対象。
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // 送金リストのシートの開閉。選択が 0 件になったら下のレンダー中リセットで false に戻る
  //（精算成功・削除・409 後の一覧更新のどれでも。次の選択で開いたまま復活させない）。
  const [sheetOpen, setSheetOpen] = useState(false);
  const settlementBarRef = useRef<HTMLButtonElement>(null);
  const closeSheet = () => setSheetOpen(false);

  // 未精算アイテム一覧（#19）。各 item に合計金額・payments・shares を含む。
  const { data: itemsData, error: fetchError } = useQuery({
    queryKey: itemKeys.list(groupId, "unsettled"),
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
  // 再計算の抑制（メモ化）は React Compiler に任せる。
  const nameById = new Map(members.map((m) => [m.userId, m.name]));
  const nameOf = (userId: string) => nameById.get(userId) ?? userId;

  // 選択中かつ一覧に存在するアイテムだけを対象に送金リストを算出する
  //（削除・精算で一覧から消えた id を取り残さない）。
  const selectedItems = items.filter((i) => selected.has(i.id));
  // 選択が空になった（409 後の一覧更新・削除など）ら、シートの開閉 state も閉じに戻す。
  // 戻さないと、次に選択したとき開いたまま復活してしまう。
  if (sheetOpen && selectedItems.length === 0) {
    setSheetOpen(false);
  }
  // シート表示中は操作エラーをシート内に出す（背面のページ側では覆われて見えないため）。
  const pageError = sheetOpen ? null : error;
  const transfers = computeSettlements(selectedItems);
  const transferRows: TransferRow[] = transfers.map((t) => ({
    key: `${t.from}->${t.to}`,
    from: nameOf(t.from),
    to: nameOf(t.to),
    amount: t.amount,
  }));

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
    // allSelected（表示用）ではなく prev から再計算するのは、クリックから
    // コールバック実行までの間に他の更新が割り込んでも正しく判定するため。
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
      // 画面で確認した送金リスト（transfers）も送り、サーバー側の再計算と一致することを
      // 確定前に検証してもらう（ADR-0013）。
      const res = await apiClient.groups[":groupId"].settlements.$post({
        param: { groupId },
        json: { itemIds, transfers },
      });
      // 409 = 一覧が古い・送金リスト不一致。先に一覧を最新化してからサーバーの理由を表示する。
      if (res.status === 409) {
        const body = await res.json();
        await queryClient.invalidateQueries({ queryKey: itemKeys.byGroup(groupId) });
        throw new Error("error" in body ? body.error : "精算に失敗しました");
      }
      if (!res.ok) {
        throw new Error("精算に失敗しました");
      }
      // 精算でアイテムが未精算 → 精算済へ移動するため、両一覧のキャッシュを無効化する
      //（前方一致で "unsettled" / "settled" の両キーが対象になる）。
      // サーバは groupId 一致かつ未精算の id のみ更新する。0 件なら（既に精算済・削除済等で）
      // 一覧が古い可能性が高いので、先に最新化してから警告する。
      const { settled } = await res.json();
      await queryClient.invalidateQueries({ queryKey: itemKeys.byGroup(groupId) });
      if (settled.length === 0) {
        throw new Error("精算対象がありませんでした（既に精算済みか削除済みの可能性があります）");
      }
      setSelected(new Set());
    }, "精算に失敗しました");
  }

  return (
    <>
      {(pageError || fetchError) && (
        <p className="note-danger w-full">
          {pageError ??
            (fetchError instanceof Error
              ? fetchError.message
              : "未精算アイテムの取得に失敗しました")}
        </p>
      )}

      <section className="flex w-full flex-col gap-3">
        {items.length === 0 ? (
          <p className="note-muted">未精算のアイテムはありません。</p>
        ) : (
          <ItemsTable
            items={items}
            selectable={{ selected, onToggle: toggle, onToggleAll: toggleAll, allSelected }}
            renderActions={(item) => (
              <>
                <Link
                  href={`/groups/${groupId}/items/${item.id}/edit`}
                  className="btn btn-line btn-sm"
                >
                  編集
                </Link>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDelete(item.id, item.name)}
                  className="btn btn-line-danger btn-sm"
                >
                  削除
                </button>
              </>
            )}
          />
        )}
      </section>

      {/* 選択 → 送金リスト（#21）と精算実行（#22）。画面下のサマリーバー＋シートで見せる。 */}
      {selectedItems.length > 0 && (
        <>
          {/* 固定バーに一覧末尾が隠れないための余白。 */}
          <div aria-hidden className="h-16" />
          {/* シート表示中もバーは残す（シートが覆う）。閉じたときのフォーカス復帰先になる。 */}
          <SettlementBar
            buttonRef={settlementBarRef}
            count={selectedItems.length}
            transfers={transferRows}
            onOpen={() => setSheetOpen(true)}
          />
          {sheetOpen && (
            <SettlementSheet
              returnFocusRef={settlementBarRef}
              count={selectedItems.length}
              transfers={transferRows}
              busy={busy}
              error={error}
              onSettle={handleSettle}
              onClose={closeSheet}
            />
          )}
        </>
      )}
    </>
  );
}
