import type { QueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export type GroupSummary = { id: string; name: string; role: string };

type GroupsData = { groups: GroupSummary[]; currentGroupId: string | null };

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
