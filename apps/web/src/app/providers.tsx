"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { SessionCacheBoundary } from "@/components/session-cache-boundary";

export function Providers({ children }: { children: React.ReactNode }) {
  // リクエストごとに QueryClient が共有されないよう、コンポーネント内で一度だけ生成する。
  // staleTime: 最高頻度のルート（クイック入力）を含むページ往復のたびに groups/members の
  // refetch が走らないようにする（CLAUDE.md のパフォーマンス方針）。データを変える操作は
  // すべて明示的に invalidateQueries しているため、この期間キャッシュを新鮮とみなしてよい。
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 60_000 } },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SessionCacheBoundary />
      {children}
    </QueryClientProvider>
  );
}
