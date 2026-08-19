"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { ItemKind } from "@warikan/domain";
import { SessionPending, SignInPrompt } from "@/components/session-states";
import { apiClient } from "@/lib/api-client";
import { SESSION_EXPIRED_MESSAGE } from "@/lib/auth-error";
import { itemKindNoun } from "@/lib/item-kind";
import { itemKeys } from "@/lib/query-keys";
import { useGroupMembers } from "@/lib/use-group-members";
import { useResolvedSession } from "@/lib/use-resolved-session";
import { ItemForm, type ItemFormInitial, type ItemFormValues } from "../../item-form";
import { PurchasedOnDuplicates } from "../../purchased-on-duplicates";

// 購入品編集ページの本体。未精算・精算済のどちらのアイテムも編集できる（Issue #24）。
// ?from=settled で精算済一覧から遷移してきたことを示し、更新後・戻るの遷移先を切り替える。
// useSearchParams() を使うため、page.tsx 側の Suspense 境界配下でマウントされる。
export function EditItemInner() {
  const params = useParams<{ groupId: string; itemId: string }>();
  const { groupId, itemId } = params;
  const searchParams = useSearchParams();
  // "settled" 以外の値（未指定・不正値）はすべて未精算一覧へ倒す。
  const from = searchParams.get("from") === "settled" ? "settled" : "unsettled";
  const listPath =
    from === "settled" ? `/groups/${groupId}/items?status=settled` : `/groups/${groupId}/items`;
  const { data: session, isPending } = useResolvedSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  // ItemForm 内部の切替（支出/収入）に見出し文言を追従させる。初期値は読み込んだアイテムの
  // kind（未ロード時は expense）で、null は「ItemForm 側でまだ上書きされていない」を表す。
  const [kindOverride, setKindOverride] = useState<ItemKind | null>(null);

  // 編集対象の購入品（payments / shares を含む単一取得）。
  const { data: itemData, error: fetchError } = useQuery({
    queryKey: itemKeys.detail(groupId, itemId),
    enabled: !!session,
    queryFn: async () => {
      const res = await apiClient.groups[":groupId"].items[":itemId"].$get({
        param: { groupId, itemId },
      });
      if (!res.ok) {
        throw new Error("アイテムの取得に失敗しました");
      }
      return res.json();
    },
  });

  // メンバー一覧（フォームの入力欄生成用）。
  const { data: membersData } = useGroupMembers(groupId, !!session);

  if (isPending) {
    return <SessionPending />;
  }

  if (!session) {
    return <SignInPrompt />;
  }

  const members = membersData?.members ?? [];
  const item = itemData?.item;

  async function handleSubmit(values: ItemFormValues) {
    const res = await apiClient.groups[":groupId"].items[":itemId"].$put({
      param: { groupId, itemId },
      json: values,
    });
    if (!res.ok) {
      const status: number = res.status;
      throw new Error(status === 401 ? SESSION_EXPIRED_MESSAGE : "アイテムの更新に失敗しました");
    }
    // 更新後は一覧・当該アイテムのキャッシュを無効化して元の一覧へ戻る。
    // from は URL パラメータでありアイテムの実際の status と一致する保証がないため、
    // 前方一致（["items", groupId]）で未精算・精算済の両一覧を無効化する。
    await queryClient.invalidateQueries({ queryKey: itemKeys.byGroup(groupId) });
    await queryClient.invalidateQueries({ queryKey: itemKeys.detail(groupId, itemId) });
    router.push(listPath);
  }

  // 金額配列を入力欄向けの userId → 文字列レコードへ変換する。
  const toRecord = (entries: { userId: string; amount: number }[]) =>
    Object.fromEntries(entries.map((e) => [e.userId, String(e.amount)]));

  const initial: ItemFormInitial | undefined = item
    ? {
        name: item.name,
        purchasedOn: item.purchasedOn ? item.purchasedOn.slice(0, 10) : "",
        memo: item.memo ?? "",
        kind: item.kind,
        payments: toRecord(item.payments),
        shares: toRecord(item.shares),
      }
    : undefined;
  const kind = kindOverride ?? item?.kind ?? "expense";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-6">
      <div className="flex flex-col gap-1">
        <span className="kicker">Edit Item</span>
        <h1 className="headline">{itemKindNoun(kind)}を編集</h1>
      </div>

      {fetchError && (
        <p className="note-danger w-full">
          {fetchError instanceof Error ? fetchError.message : "アイテムの取得に失敗しました"}
        </p>
      )}

      {/* 初期値が確定してからフォームを描画する（ItemForm は初期値をマウント時に取り込むため）。 */}
      {item && initial ? (
        <ItemForm
          members={members}
          initial={initial}
          submitLabel="更新"
          renderPurchasedOnNote={(purchasedOn) => (
            <PurchasedOnDuplicates
              groupId={groupId}
              purchasedOn={purchasedOn}
              excludeItemId={itemId}
            />
          )}
          onKindChange={setKindOverride}
          onSubmit={handleSubmit}
        />
      ) : (
        !fetchError && <p className="note-muted">読み込み中…</p>
      )}

      <Link href={listPath} className="link-quiet self-start">
        {from === "settled" ? "精算済一覧へ戻る" : "未精算一覧へ戻る"}
      </Link>
    </main>
  );
}
