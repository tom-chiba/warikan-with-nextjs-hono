"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { MainNav } from "@/components/main-nav";
import { SessionPending, SignInPrompt } from "@/components/session-states";
import { useSession } from "@/lib/auth-client";
import { setCurrentGroup } from "@/lib/current-group";
import { useGroups } from "@/lib/use-groups";
import { SettledView } from "./settled-view";
import { UnsettledView } from "./unsettled-view";

// アイテム一覧ページの本体。?status= で未精算 / 精算済ビューを切り替える（Epic #6）。
// ナビゲーション（入力 / 未精算 / 精算済タブ・グループ切替）は MainNav が担う（#51）。
// useSearchParams() を使うため、page.tsx 側の Suspense 境界配下でマウントされる。
export function ItemsPageInner() {
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;
  const searchParams = useSearchParams();
  // "settled" 以外の値（未指定・不正値）はすべて未精算ビューに倒す。
  const status = searchParams.get("status") === "settled" ? "settled" : "unsettled";
  const { data: session, isPending } = useSession();
  const queryClient = useQueryClient();

  // MainNav のグループ切替セレクタ表示用。queryKey ["groups"] は / と共有されるため、
  // キャッシュが温まっていれば追加の往復は発生しない。
  const { data: groupsData } = useGroups(!!session);

  // このグループを「最後に開いた」として記録する。直接 URL で開いた場合でも、
  // 次回 / を開いたときにこのグループのクイック入力が出るようカレントを同期する（#51）。
  // 一覧取得が済んでから比較し、すでにカレントなら何もしない（無駄な PUT を打たない）。
  const loggedIn = !!session;
  const currentGroupId = groupsData?.currentGroupId;
  const groupsLoaded = !!groupsData;
  useEffect(() => {
    if (!loggedIn || !groupsLoaded || currentGroupId === groupId) {
      return;
    }
    setCurrentGroup(queryClient, groupId);
  }, [loggedIn, groupsLoaded, currentGroupId, groupId, queryClient]);

  if (isPending) {
    return <SessionPending />;
  }

  if (!session) {
    return <SignInPrompt />;
  }

  return (
    <main className="flex flex-1 flex-col items-center gap-8 p-8">
      <MainNav
        groups={groupsData?.groups ?? []}
        selectedGroupId={groupId}
        activeTab={status === "settled" ? "settled" : "unsettled"}
      />
      <h1 className="text-2xl font-semibold">
        {status === "settled" ? "精算済アイテム" : "未精算アイテム"}
      </h1>

      {status === "settled" ? (
        <SettledView groupId={groupId} />
      ) : (
        <UnsettledView groupId={groupId} />
      )}
    </main>
  );
}
