"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useSession } from "@/lib/auth-client";

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
    prevUserIdRef.current = userId;
  }, [userId, queryClient]);

  return null;
}
