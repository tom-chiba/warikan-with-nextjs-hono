"use client";

import { useState } from "react";
import type { ItemKind } from "@warikan/domain";
import { itemKindNoun } from "@/lib/item-kind";
import { useGroupMembers } from "@/lib/use-group-members";
import { ItemForm } from "./groups/[groupId]/items/item-form";
import { PurchasedOnDuplicates } from "./groups/[groupId]/items/purchased-on-duplicates";
import { useCreateItem } from "./groups/[groupId]/items/use-create-item";

// ルートページのクイック入力。グループを指定すると、メンバー取得・保存処理・入力フォームを
// 自己完結で提供する（/groups/[groupId]/items/new と同等の入力体験を / 上で再現する）。
// グループの選び方（現状は「所属が 1 件ならそのグループ」）は呼び出し側の責務。
export function QuickItemEntry({ groupId, groupName }: { groupId: string; groupName: string }) {
  // ログイン済みの文脈でのみ描画される前提のため、常に取得する。
  const { data: membersData, isError: membersError } = useGroupMembers(groupId, true);
  const members = membersData?.members ?? [];
  const handleSubmit = useCreateItem(groupId);
  // ItemForm 内部の切替（支出/収入）に見出し文言を追従させる（収入分配機能）。
  const [kind, setKind] = useState<ItemKind>("expense");

  return (
    <section className="flex w-full max-w-md flex-col gap-4">
      {/* 一覧への導線は MainNav の「未精算 / 精算済」タブが担うため、ここには置かない（#51）。 */}
      <div className="flex flex-col gap-1">
        <span className="kicker">Quick Entry</span>
        <h2 className="headline">
          {groupName} に{itemKindNoun(kind)}を入力
        </h2>
      </div>
      {membersError ? (
        // members が空のままだと ItemForm が「読み込み中」を出し続けるため、失敗は明示する。
        <p className="note-danger">メンバー一覧の取得に失敗しました。</p>
      ) : (
        <ItemForm
          members={members}
          submitLabel="保存"
          resetAfterSubmit
          successMessage="保存しました"
          renderPurchasedOnNote={(purchasedOn) => (
            <PurchasedOnDuplicates groupId={groupId} purchasedOn={purchasedOn} />
          )}
          onKindChange={setKind}
          onSubmit={handleSubmit}
        />
      )}
    </section>
  );
}
