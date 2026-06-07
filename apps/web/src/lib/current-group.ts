import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import { useGroups } from "@/lib/use-groups";

// GET /groups のレスポンス型は RPC から導出し、サーバー側の形変更に型レベルで追従する。
type GroupsData = InferResponseType<typeof apiClient.groups.$get, 200>;
export type GroupSummary = GroupsData["groups"][number];

// GET /groups のレスポンス（groups + currentGroupId）からカレントグループを解決する。
// currentGroupId が一覧に存在しない（未記録・脱退済み等）場合は先頭グループへフォールバックし、
// 所属が 0 件なら null を返す（#51）。
export function resolveCurrentGroup(
  groups: GroupSummary[],
  currentGroupId: string | null | undefined,
): GroupSummary | null {
  return groups.find((g) => g.id === currentGroupId) ?? groups[0] ?? null;
}

// グループを「最後に開いた」としてサーバーへ記録し、["groups"] キャッシュの currentGroupId も
// 即時更新する（画面側は再フェッチなしでカレントの切替に追従できる）。サーバーへの記録は
// 次回以降の解決を良くするための楽観的な書き込みで、失敗しても現在の表示には影響しないため
// 握りつぶす（fire-and-forget）。
export function setCurrentGroup(queryClient: QueryClient, groupId: string) {
  queryClient.setQueryData(["groups"], (old: GroupsData | undefined) =>
    old ? { ...old, currentGroupId: groupId } : old,
  );
  apiClient.groups[":groupId"]["last-viewed"].$put({ param: { groupId } }).catch(() => {
    // ネットワーク断等。カレントはキャッシュ上で切り替わっており、記録は次の機会に任せる。
  });
}

// 表示中のグループを「最後に開いた」として記録する同期フック。URL でグループが確定する
// 画面（items ページ等）から呼ぶ。直接 URL で開いた場合でも、次回 / を開いたときに
// このグループのクイック入力が出るようカレントを同期する（#51）。
//
// currentGroupId は依存に入れず effect 内でキャッシュから読む。依存に入れると、
// セレクタでの切替（setCurrentGroup によるキャッシュ更新 → 遷移）の際に旧グループの
// ページでこの effect が unmount 前に再実行され、旧グループを記録し直して切替を
// 上書きしてしまう。カレントの書き込み経路はこのフックと setCurrentGroup の 2 つで、
// いずれもこのファイルに集約する。
export function useMarkGroupViewed(groupId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  // / や MainNav と同じ queryKey ["groups"] を購読するだけで、追加リクエストは発生しない。
  const { data: groupsData } = useGroups(enabled);

  const groupsLoaded = !!groupsData;
  // 脱退済み等、所属一覧に無いグループは記録しない（無効なカレントを作らない）。
  const isMember = !!groupsData?.groups.some((g) => g.id === groupId);

  useEffect(() => {
    if (!enabled || !groupsLoaded || !isMember) {
      return;
    }
    const cached = queryClient.getQueryData<GroupsData>(["groups"]);
    if (!cached || cached.currentGroupId === groupId) {
      return;
    }
    setCurrentGroup(queryClient, groupId);
  }, [enabled, groupsLoaded, isMember, groupId, queryClient]);
}
