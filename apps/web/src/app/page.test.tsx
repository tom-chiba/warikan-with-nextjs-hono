import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import Home from "./page";

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("見出しを表示し、API のメッセージを取得して描画する", async () => {
  // hono クライアントが内部で使う fetch をモックし、実クライアント経由の取得を検証する。
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ message: "Hello, chiba!" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

  renderWithClient(<Home />);

  expect(screen.getByRole("heading", { name: "warikan" })).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.getByText("API: Hello, chiba!")).toBeInTheDocument();
  });
});
