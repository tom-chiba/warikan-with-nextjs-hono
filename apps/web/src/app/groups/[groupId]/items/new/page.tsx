"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { SessionPending, SignInPrompt } from "@/components/session-states";
import { useGroupMembers } from "@/lib/use-group-members";
import { useResolvedSession } from "@/lib/use-resolved-session";
import { ItemForm } from "../item-form";
import { PurchasedOnDuplicates } from "../purchased-on-duplicates";
import { useCreateItem } from "../use-create-item";

export default function NewItemPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;
  const { data: session, isPending } = useResolvedSession();
  const handleSubmit = useCreateItem(groupId);

  // メンバー一覧（#7 の既存エンドポイント）。ログイン済みのときだけ取得する。
  const { data: membersData } = useGroupMembers(groupId, !!session);

  if (isPending) {
    return <SessionPending />;
  }

  if (!session) {
    return <SignInPrompt />;
  }

  const members = membersData?.members ?? [];

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
        successMessage="保存しました"
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
