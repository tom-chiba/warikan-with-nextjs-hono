"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { SessionPending, SignInPrompt } from "@/components/session-states";
import { apiClient } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";
import { useGroupMembers } from "@/lib/use-group-members";
import { ItemForm, type ItemFormInitial, type ItemFormValues } from "../../item-form";

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
  const { data: session, isPending } = useSession();
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
    // 更新後は遷移元の一覧・当該アイテムのキャッシュを無効化して元の一覧へ戻る。
    await queryClient.invalidateQueries({ queryKey: ["items", groupId, from] });
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
    <main className="flex flex-1 flex-col items-center gap-8 p-8">
      <h1 className="text-2xl font-semibold">購入品を編集</h1>

      {fetchError && (
        <p className="w-full max-w-md text-sm text-red-500">
          {fetchError instanceof Error ? fetchError.message : "アイテムの取得に失敗しました"}
        </p>
      )}

      {/* 初期値が確定してからフォームを描画する（ItemForm は初期値をマウント時に取り込むため）。 */}
      {item && initial ? (
        <ItemForm members={members} initial={initial} submitLabel="更新" onSubmit={handleSubmit} />
      ) : (
        !fetchError && <p className="text-sm text-zinc-500">読み込み中…</p>
      )}

      <Link href={listPath} className="rounded-md border px-4 py-2">
        {from === "settled" ? "精算済一覧へ戻る" : "未精算一覧へ戻る"}
      </Link>
    </main>
  );
}
