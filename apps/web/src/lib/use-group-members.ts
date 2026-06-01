import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

// グループのメンバー一覧を取得する共有クエリ（購入品入力・編集・未精算一覧など複数ページで利用）。
// enabled にはログイン済みか（!!session）を渡す。queryKey はページ間でキャッシュを共有する。
export function useGroupMembers(groupId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["members", groupId],
    enabled,
    queryFn: async () => {
      const res = await apiClient.groups[":groupId"].members.$get({ param: { groupId } });
      if (!res.ok) {
        throw new Error("メンバー一覧の取得に失敗しました");
      }
      return res.json();
    },
  });
}
