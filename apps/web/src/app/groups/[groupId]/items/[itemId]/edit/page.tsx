"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { SessionPending, SignInPrompt } from "@/components/session-states";
import { apiClient } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";
import { useGroupMembers } from "@/lib/use-group-members";
import { ItemForm, type ItemFormInitial, type ItemFormValues } from "../../item-form";

export default function EditItemPage() {
  const params = useParams<{ groupId: string; itemId: string }>();
  const { groupId, itemId } = params;
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
  // 編集は未精算アイテムのみ可。精算済はサーバ側でも PUT 404 になるため、
  // フォームを出さず先に案内して手戻り（入力後に失敗）を防ぐ。
  const isSettled = item?.status === "settled";

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
    // 更新後は一覧・当該アイテムのキャッシュを無効化して未精算一覧へ戻る。
    await queryClient.invalidateQueries({ queryKey: ["items", groupId, "unsettled"] });
    await queryClient.invalidateQueries({ queryKey: ["item", groupId, itemId] });
    router.push(`/groups/${groupId}/items`);
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

      {/* 精算済は編集不可。初期値が確定してからフォームを描画する（ItemForm は初期値をマウント時に取り込むため）。 */}
      {isSettled ? (
        <p className="w-full max-w-md text-sm text-zinc-500">
          このアイテムは精算済みのため編集できません。
        </p>
      ) : item && initial ? (
        <ItemForm members={members} initial={initial} submitLabel="更新" onSubmit={handleSubmit} />
      ) : (
        !fetchError && <p className="text-sm text-zinc-500">読み込み中…</p>
      )}

      <Link href={`/groups/${groupId}/items`} className="rounded-md border px-4 py-2">
        未精算一覧へ戻る
      </Link>
    </main>
  );
}
