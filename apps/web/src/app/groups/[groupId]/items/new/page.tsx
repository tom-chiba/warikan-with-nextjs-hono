"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SessionPending, SignInPrompt } from "@/components/session-states";
import { apiClient } from "@/lib/api-client";
import { useGroupMembers } from "@/lib/use-group-members";
import { useResolvedSession } from "@/lib/use-resolved-session";
import { ItemForm, type ItemFormValues } from "../item-form";
import { PurchasedOnDuplicates } from "../purchased-on-duplicates";

export default function NewItemPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;
  const { data: session, isPending } = useResolvedSession();
  const queryClient = useQueryClient();

  // メンバー一覧（#7 の既存エンドポイント）。ログイン済みのときだけ取得する。
  const { data: membersData } = useGroupMembers(groupId, !!session);

  if (isPending) {
    return <SessionPending />;
  }

  if (!session) {
    return <SignInPrompt />;
  }

  const members = membersData?.members ?? [];

  async function handleSubmit(values: ItemFormValues) {
    const res = await apiClient.groups[":groupId"].items.$post({
      param: { groupId },
      json: values,
    });
    if (!res.ok) {
      const status: number = res.status;
      throw new Error(
        status === 401
          ? "セッションが切れました。再度サインインしてください。"
          : "購入品の保存に失敗しました",
      );
    }
    // 連続入力では保存後も購入日が今日のまま維持され、PurchasedOnDuplicates が同じキーで
    // マウントされ続けるため放置すると重複ヒントが保存前のままになる。当該日のクエリを無効化して
    // 今入れたアイテムを反映させる（日付別に複数キーがありうるので groupId 前方一致で無効化）。
    await queryClient.invalidateQueries({ queryKey: ["items-on-date", groupId] });
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-6">
      <div className="flex flex-col gap-1">
        <span className="kicker">New Item</span>
        <h1 className="headline">購入品を入力</h1>
      </div>

      <ItemForm
        members={members}
        submitLabel="保存"
        resetAfterSubmit
        successMessage="保存しました。続けて入力できます。"
        renderPurchasedOnNote={(purchasedOn) => (
          <PurchasedOnDuplicates groupId={groupId} purchasedOn={purchasedOn} />
        )}
        onSubmit={handleSubmit}
      />

      {/* 日常動線の戻り先は未精算一覧（グループ詳細は設定動線のページ、#51）。 */}
      <Link href={`/groups/${groupId}/items`} className="link-quiet self-start">
        購入品一覧へ戻る
      </Link>
    </main>
  );
}
