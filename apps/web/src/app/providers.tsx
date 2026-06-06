"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { SessionCacheBoundary } from "@/components/session-cache-boundary";

export function Providers({ children }: { children: React.ReactNode }) {
  // リクエストごとに QueryClient が共有されないよう、コンポーネント内で一度だけ生成する。
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SessionCacheBoundary />
      {children}
    </QueryClientProvider>
  );
}
