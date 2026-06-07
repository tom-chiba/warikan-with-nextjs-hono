"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { SessionCacheBoundary } from "@/components/session-cache-boundary";
import { UnauthorizedError } from "@/lib/api-client";

export function Providers({ children }: { children: React.ReactNode }) {
  // リクエストごとに QueryClient が共有されないよう、コンポーネント内で一度だけ生成する。
  // staleTime: 最高頻度のルート（クイック入力）を含むページ往復のたびに groups/members の
  // refetch が走らないようにする（CLAUDE.md のパフォーマンス方針）。データを変える操作は
  // すべて明示的に invalidateQueries しているため、この期間キャッシュを新鮮とみなしてよい。
  // retry: 401（未ログインでの並列発火、use-groups.ts）はリトライ無駄打ちしない。それ以外は既定の 3 回。
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            retry: (failureCount, error) =>
              !(error instanceof UnauthorizedError) && failureCount < 3,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SessionCacheBoundary />
      {children}
    </QueryClientProvider>
  );
}
