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
    {
      userId: "u1",
      name: "太郎",
      displayName: null,
      email: "t@example.com",
      role: "owner",
      joinedAt: "x",
    },
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

test("['members', groupId] キャッシュが既にあれば同梱データで上書きしない", async () => {
  // 同梱データは groups リクエスト発出時点のスナップショット。メンバー変更後に取得した
  // 新しい members キャッシュを、遅れて着弾した古い groups レスポンスが潰さないこと。
  const fresh = [
    {
      userId: "u1",
      name: "太郎",
      displayName: null,
      email: "t@example.com",
      role: "owner",
      joinedAt: "x",
    },
    {
      userId: "u2",
      name: "次郎",
      displayName: null,
      email: "j@example.com",
      role: "member",
      joinedAt: "y",
    },
  ];
  groupsGetMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      groups: [{ id: "g1", name: "旅行", role: "owner" }],
      currentGroupId: "g1",
      currentGroupMembers: {
        groupId: "g1",
        members: [fresh[0]], // 古いスナップショット（u2 がいない）
      },
    }),
  });

  const { queryClient, result } = renderUseGroups();
  queryClient.setQueryData(["members", "g1"], { members: fresh });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(queryClient.getQueryData(["members", "g1"])).toEqual({ members: fresh });
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
