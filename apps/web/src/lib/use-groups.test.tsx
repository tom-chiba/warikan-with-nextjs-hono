import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useGroups } from "@/lib/use-groups";

const { groupsGetMock } = vi.hoisted(() => ({ groupsGetMock: vi.fn() }));
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    groups: { $get: (...args: unknown[]) => groupsGetMock(...args) },
  },
  UnauthorizedError: class extends Error {},
}));

afterEach(() => {
  vi.clearAllMocks();
});

function renderUseGroups() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, ...renderHook(() => useGroups(true), { wrapper }) };
}

test("同梱された currentGroupMembers を ['members', groupId] キャッシュへ先回りで取り込む", async () => {
  const members = [
    { userId: "u1", name: "太郎", email: "t@example.com", role: "owner", joinedAt: "x" },
  ];
  groupsGetMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      groups: [{ id: "g1", name: "旅行", role: "owner" }],
      currentGroupId: "g1",
      currentGroupMembers: { groupId: "g1", members },
    }),
  });

  const { queryClient, result } = renderUseGroups();

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  // QuickItemEntry の useGroupMembers がこのキャッシュを拾い、members の往復が発生しない。
  expect(queryClient.getQueryData(["members", "g1"])).toEqual({ members });
});

test("currentGroupMembers が null（所属 0 件等）なら members キャッシュには何も書かない", async () => {
  groupsGetMock.mockResolvedValue({
    ok: true,
    json: async () => ({ groups: [], currentGroupId: null, currentGroupMembers: null }),
  });

  const { queryClient, result } = renderUseGroups();

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(queryClient.getQueriesData({ queryKey: ["members"] })).toEqual([]);
});
