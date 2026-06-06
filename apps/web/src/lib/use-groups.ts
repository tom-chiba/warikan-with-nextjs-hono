import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

// 所属グループ一覧を取得する共有クエリ（グループ一覧・ルートのクイック入力で利用）。
// enabled にはログイン済みか（!!session）を渡す。queryKey はページ間でキャッシュを共有する。
export function useGroups(enabled: boolean) {
  return useQuery({
    queryKey: ["groups"],
    enabled,
    queryFn: async () => {
      const res = await apiClient.groups.$get();
      if (!res.ok) {
        throw new Error("グループ一覧の取得に失敗しました");
      }
      return res.json();
    },
  });
}
