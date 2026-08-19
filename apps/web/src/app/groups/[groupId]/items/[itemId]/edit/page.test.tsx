import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { renderWithClient } from "@/test/render-with-client";

const { useSessionMock, itemGetMock, membersGetMock, putMock, pushMock, searchParamsMock } =
  vi.hoisted(() => ({
    useSessionMock: vi.fn(),
    itemGetMock: vi.fn(),
    membersGetMock: vi.fn(),
    putMock: vi.fn(),
    pushMock: vi.fn(),
    searchParamsMock: vi.fn(),
  }));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => useSessionMock(),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ groupId: "g1", itemId: "i1" }),
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParamsMock(),
}));
vi.mock("@/lib/api-client", () => ({
  // use-groups が 401 時に参照する実体もモックに持たせる（欠けると 401 系テスト追加時に new undefined() で落ちる）。
  UnauthorizedError: class extends Error {},
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
    {
      userId: "owner",
      name: "オーナー",
      displayName: null,
      email: "o@example.com",
      role: "owner",
      joinedAt: "x",
    },
    {
      userId: "friend",
      name: "フレンド",
      displayName: null,
      email: "f@example.com",
      role: "member",
      joinedAt: "y",
    },
  ],
};

const item = {
  item: {
    id: "i1",
    name: "ランチ",
    purchasedOn: "2026-06-01T00:00:00.000Z",
    memo: "駅前",
    status: "unsettled",
    kind: "expense",
    total: 1000,
    payments: [{ userId: "owner", amount: 1000 }],
    shares: [
      { userId: "owner", amount: 500 },
      { userId: "friend", amount: 500 },
    ],
  },
};

beforeEach(() => {
  // 既定は未精算一覧からの遷移（クエリパラメータなし）。
  searchParamsMock.mockReturnValue(new URLSearchParams(""));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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

test("編集時は等分が OFF で、手動調整済みの割勘金額が等分で上書きされない", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  // 等分（500/500）とは異なる手動調整済みの割勘を持つアイテム。
  itemGetMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      item: {
        ...item.item,
        shares: [
          { userId: "owner", amount: 700 },
          { userId: "friend", amount: 300 },
        ],
      },
    }),
  });
  membersGetMock.mockResolvedValue({ ok: true, json: async () => members });

  renderWithClient(<EditItemPage />);

  await screen.findByDisplayValue("ランチ");
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(screen.getByLabelText("オーナー の割勘金額")).toHaveValue(700);
  expect(screen.getByLabelText("フレンド の割勘金額")).toHaveValue(300);
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
        kind: "expense",
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

test("精算済アイテムも編集でき、from=settled なら更新後に精算済一覧へ遷移する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  searchParamsMock.mockReturnValue(new URLSearchParams("from=settled"));
  itemGetMock.mockResolvedValue({
    ok: true,
    json: async () => ({ item: { ...item.item, status: "settled" } }),
  });
  membersGetMock.mockResolvedValue({ ok: true, json: async () => members });
  putMock.mockResolvedValue({ ok: true, json: async () => ({ id: "i1" }) });

  renderWithClient(<EditItemPage />);

  // 精算済でもフォームがプリフィルされて表示される（Issue #24）。
  await screen.findByDisplayValue("ランチ");
  await userEvent.click(screen.getByRole("button", { name: "更新" }));

  await waitFor(() => {
    expect(putMock).toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith("/groups/g1/items?status=settled");
  });
});
