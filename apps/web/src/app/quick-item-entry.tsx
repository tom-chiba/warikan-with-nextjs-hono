"use client";

import { apiClient } from "@/lib/api-client";
import { useGroupMembers } from "@/lib/use-group-members";
import { ItemForm, type ItemFormValues } from "./groups/[groupId]/items/item-form";

// ルートページのクイック入力。グループを指定すると、メンバー取得・保存処理・入力フォームを
// 自己完結で提供する（/groups/[groupId]/items/new と同等の入力体験を / 上で再現する）。
// グループの選び方（現状は「所属が 1 件ならそのグループ」）は呼び出し側の責務。
export function QuickItemEntry({ groupId, groupName }: { groupId: string; groupName: string }) {
  // ログイン済みの文脈でのみ描画される前提のため、常に取得する。
  const { data: membersData, isError: membersError } = useGroupMembers(groupId, true);
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
  }

  return (
    <section className="flex w-full max-w-md flex-col gap-4">
      {/* 一覧への導線は MainNav の「未精算 / 精算済」タブが担うため、ここには置かない（#51）。 */}
      <h2 className="text-lg font-medium">{groupName} に購入品を入力</h2>
      {membersError ? (
        // members が空のままだと ItemForm が「読み込み中」を出し続けるため、失敗は明示する。
        <p className="text-sm text-red-500">メンバー一覧の取得に失敗しました。</p>
      ) : (
        <ItemForm
          members={members}
          submitLabel="保存"
          resetAfterSubmit
          successMessage="保存しました。続けて入力できます。"
          onSubmit={handleSubmit}
        />
      )}
    </section>
  );
}
