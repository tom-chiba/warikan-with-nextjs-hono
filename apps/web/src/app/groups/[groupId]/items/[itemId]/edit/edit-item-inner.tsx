"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { SessionPending, SignInPrompt } from "@/components/session-states";
import { apiClient } from "@/lib/api-client";
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

  // 編集対象の購入品（payments / shares を含む単一取得）。
  const { data: itemData, error: fetchError } = useQuery({
    queryKey: ["item", groupId, itemId],
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
      throw new Error(
        status === 401
          ? "セッションが切れました。再度サインインしてください。"
          : "アイテムの更新に失敗しました",
      );
    }
    // 更新後は一覧・当該アイテムのキャッシュを無効化して元の一覧へ戻る。
    // from は URL パラメータでありアイテムの実際の status と一致する保証がないため、
    // 前方一致（["items", groupId]）で未精算・精算済の両一覧を無効化する。
    await queryClient.invalidateQueries({ queryKey: ["items", groupId] });
    await queryClient.invalidateQueries({ queryKey: ["item", groupId, itemId] });
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
        payments: toRecord(item.payments),
        shares: toRecord(item.shares),
      }
    : undefined;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-6">
      <div className="flex flex-col gap-1">
        <span className="kicker">Edit Item</span>
        <h1 className="headline">購入品を編集</h1>
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
