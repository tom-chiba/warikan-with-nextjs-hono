import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { apiClient, UnauthorizedError } from "@/lib/api-client";

// ["members", groupId] キャッシュの値の型。members エンドポイントのレスポンス型から導出し、
// シードする形がエンドポイント側の変更とずれたらコンパイルエラーになるようにする。
type MembersData = InferResponseType<(typeof apiClient.groups)[":groupId"]["members"]["$get"], 200>;

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
      // キャッシュが空のときだけ書く: この同梱データは groups リクエスト発出時点のスナップショット
      // なので、メンバー変更直後に発出済みの古い groups レスポンスが、変更後に取得した新しい
      // members キャッシュへ遅れて着弾して上書きする競合を避ける（初期表示の往復削減には
      // 「空のとき」だけで十分）。
      const seed = data.currentGroupMembers;
      if (seed && queryClient.getQueryData(["members", seed.groupId]) === undefined) {
        queryClient.setQueryData<MembersData>(["members", seed.groupId], {
          members: seed.members,
        });
      }
      return data;
    },
  });
}
