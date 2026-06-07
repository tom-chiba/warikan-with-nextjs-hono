import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, UnauthorizedError } from "@/lib/api-client";

// 所属グループ一覧を取得する共有クエリ（グループ一覧・ルートのクイック入力で利用）。
// queryKey はページ間でキャッシュを共有する。enabled は呼び出し側の事情で制御する：
// ルート / はセッション解決を待たず true で並列発火し（初期表示の直列往復を減らす）、
// その他のページは従来どおりログイン済みか（!!session）を渡す。
// 401 のリトライ抑止はクエリ単位ではなく QueryClient の既定（providers.tsx）で行う
//（クエリ単位の retry はテストの retry: false 等、クライアント側の既定を上書きしてしまうため）。
export function useGroups(enabled: boolean) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["groups"],
    enabled,
    queryFn: async () => {
      const res = await apiClient.groups.$get();
      if (res.status === 401) {
        throw new UnauthorizedError("未ログインです");
      }
      if (!res.ok) {
        throw new Error("グループ一覧の取得に失敗しました");
      }
      const data = await res.json();
      // クイック入力が最初に表示するグループのメンバーがレスポンスに同梱されてくるので、
      // ["members", groupId] キャッシュへ先回りで取り込み、ルートページの members 往復を消す
      //（QuickItemEntry の useGroupMembers が staleTime 内のこのキャッシュを拾う）。
      if (data.currentGroupMembers) {
        queryClient.setQueryData(["members", data.currentGroupMembers.groupId], {
          members: data.currentGroupMembers.members,
        });
      }
      return data;
    },
  });
}
