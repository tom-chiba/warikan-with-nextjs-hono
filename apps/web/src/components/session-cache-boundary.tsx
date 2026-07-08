"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useSession } from "@/lib/auth-client";
import { groupKeys } from "@/lib/query-keys";

// セッションのユーザーが居なくなった・切り替わったタイミングで Query キャッシュを丸ごと破棄する。
// サインアウトボタンなど個別の経路に処理を持たせず、セッション状態の変化そのものに反応することで、
// サインアウト・アカウント削除・セッション失効のどの経路でも前ユーザーのデータが次のユーザーに
// 見えないようにする。useSession の更新後に動くため、enabled: !!session のクエリは破棄時点で
// 既に無効化されており、破棄が無効セッションでの refetch を誘発することもない。
export function SessionCacheBoundary() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const userId = session?.user.id ?? null;
  const prevUserIdRef = useRef(userId);

  useEffect(() => {
    // 「ユーザーあり → なし/別ユーザー」のときだけ破棄する（未ログイン → ログインでは破棄しない）。
    if (prevUserIdRef.current !== null && prevUserIdRef.current !== userId) {
      queryClient.clear();
    }
    // 「未ログイン → ログイン」では破棄ではなく無効化する。ルート / はセッション解決を待たず
    // groups を並列発火するため（use-groups.ts）、サインイン前の 401 エラー状態が残っている。
    // invalidate でクッキー付きの再取得を促す。セッション解決前に発火するクエリは groups だけ
    // なので、対象もそれに絞る（将来別の先行クエリを足す場合はここに追記する）。
    if (prevUserIdRef.current === null && userId !== null) {
      queryClient.invalidateQueries({ queryKey: groupKeys.all() });
    }
    prevUserIdRef.current = userId;
  }, [userId, queryClient]);

  return null;
}
