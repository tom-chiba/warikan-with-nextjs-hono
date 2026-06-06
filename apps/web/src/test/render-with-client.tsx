import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";

// useQuery を使うコンポーネントのテスト共通ヘルパー。
// テストごとに独立した QueryClient（リトライ無効）を生成して QueryClientProvider で包む。
export function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
