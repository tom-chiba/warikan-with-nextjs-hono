"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { SessionPending, SignInPrompt } from "@/components/session-states";
import { apiClient } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";
import { useGroupMembers } from "@/lib/use-group-members";
import { ItemForm, type ItemFormValues } from "../item-form";

export default function NewItemPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;
  const { data: session, isPending } = useSession();

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
  }

  return (
    <main className="flex flex-1 flex-col items-center gap-8 p-8">
      <h1 className="text-2xl font-semibold">購入品を入力</h1>

      <ItemForm
        members={members}
        submitLabel="保存"
        resetAfterSubmit
        successMessage="保存しました。続けて入力できます。"
        onSubmit={handleSubmit}
      />

      <Link href={`/groups/${groupId}`} className="rounded-md border px-4 py-2">
        グループへ戻る
      </Link>
    </main>
  );
}
