import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";

const { useSessionMock, itemGetMock, membersGetMock, putMock, pushMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  itemGetMock: vi.fn(),
  membersGetMock: vi.fn(),
  putMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => useSessionMock(),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ groupId: "g1", itemId: "i1" }),
  useRouter: () => ({ push: pushMock }),
}));
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    groups: {
      ":groupId": {
        items: {
          ":itemId": {
            $get: (...args: unknown[]) => itemGetMock(...args),
            $put: (...args: unknown[]) => putMock(...args),
          },
        },
        members: { $get: (...args: unknown[]) => membersGetMock(...args) },
      },
    },
  },
}));

import EditItemPage from "./page";

const loggedIn = { data: { user: { id: "owner", email: "me@example.com" } }, isPending: false };

const members = {
  members: [
    { userId: "owner", name: "オーナー", email: "o@example.com", role: "owner", joinedAt: "x" },
    { userId: "friend", name: "フレンド", email: "f@example.com", role: "member", joinedAt: "y" },
  ],
};

const item = {
  item: {
    id: "i1",
    name: "ランチ",
    purchasedOn: "2026-06-01T00:00:00.000Z",
    memo: "駅前",
    status: "unsettled",
    total: 1000,
    payments: [{ userId: "owner", amount: 1000 }],
    shares: [
      { userId: "owner", amount: 500 },
      { userId: "friend", amount: 500 },
    ],
  },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

test("既存値がフォームにプリフィルされる", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemGetMock.mockResolvedValue({ ok: true, json: async () => item });
  membersGetMock.mockResolvedValue({ ok: true, json: async () => members });

  renderWithClient(<EditItemPage />);

  expect(await screen.findByDisplayValue("ランチ")).toBeInTheDocument();
  expect(screen.getByDisplayValue("駅前")).toBeInTheDocument();
  // owner の支払額に 1000 が入っている。
  expect(screen.getByLabelText("オーナー の支払額")).toHaveValue(1000);
});

test("更新すると PUT が呼ばれ、一覧へ遷移する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemGetMock.mockResolvedValue({ ok: true, json: async () => item });
  membersGetMock.mockResolvedValue({ ok: true, json: async () => members });
  putMock.mockResolvedValue({ ok: true, json: async () => ({ id: "i1" }) });

  renderWithClient(<EditItemPage />);

  await screen.findByDisplayValue("ランチ");
  await userEvent.click(screen.getByRole("button", { name: "更新" }));

  await waitFor(() => {
    expect(putMock).toHaveBeenCalledWith({
      param: { groupId: "g1", itemId: "i1" },
      json: {
        name: "ランチ",
        purchasedOn: "2026-06-01",
        memo: "駅前",
        payments: [{ userId: "owner", amount: 1000 }],
        shares: [
          { userId: "owner", amount: 500 },
          { userId: "friend", amount: 500 },
        ],
      },
    });
    expect(pushMock).toHaveBeenCalledWith("/groups/g1/items");
  });
});

test("精算済アイテムは編集できず、フォームは表示されない", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemGetMock.mockResolvedValue({
    ok: true,
    json: async () => ({ item: { ...item.item, status: "settled" } }),
  });
  membersGetMock.mockResolvedValue({ ok: true, json: async () => members });

  renderWithClient(<EditItemPage />);

  expect(
    await screen.findByText("このアイテムは精算済みのため編集できません。"),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "更新" })).not.toBeInTheDocument();
});
