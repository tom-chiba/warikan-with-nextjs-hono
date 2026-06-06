import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

const { useSessionMock } = vi.hoisted(() => ({ useSessionMock: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({
  useSession: () => useSessionMock(),
}));

import { SessionCacheBoundary } from "./session-cache-boundary";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function makeClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["groups"], { groups: [{ id: "g1", name: "旅行", role: "owner" }] });
  return client;
}

function boundaryWith(client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <SessionCacheBoundary />
    </QueryClientProvider>
  );
}

test("サインアウト（ユーザーあり → なし）でキャッシュを破棄する", () => {
  const client = makeClient();
  useSessionMock.mockReturnValue({ data: { user: { id: "u1", email: "a@example.com" } } });
  const { rerender } = render(boundaryWith(client));
  expect(client.getQueryData(["groups"])).toBeDefined();

  useSessionMock.mockReturnValue({ data: null });
  rerender(boundaryWith(client));

  expect(client.getQueryData(["groups"])).toBeUndefined();
});

test("別ユーザーへの切り替わりでキャッシュを破棄する", () => {
  const client = makeClient();
  useSessionMock.mockReturnValue({ data: { user: { id: "u1", email: "a@example.com" } } });
  const { rerender } = render(boundaryWith(client));

  useSessionMock.mockReturnValue({ data: { user: { id: "u2", email: "b@example.com" } } });
  rerender(boundaryWith(client));

  expect(client.getQueryData(["groups"])).toBeUndefined();
});

test("未ログイン → ログインでは破棄しない", () => {
  const client = makeClient();
  useSessionMock.mockReturnValue({ data: null });
  const { rerender } = render(boundaryWith(client));

  useSessionMock.mockReturnValue({ data: { user: { id: "u1", email: "a@example.com" } } });
  rerender(boundaryWith(client));

  expect(client.getQueryData(["groups"])).toBeDefined();
});
