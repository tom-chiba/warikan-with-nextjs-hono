import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { useSessionMock, itemsGetMock, membersGetMock, itemDeleteMock, settleMock, confirmMock } =
  vi.hoisted(() => ({
    useSessionMock: vi.fn(),
    itemsGetMock: vi.fn(),
    membersGetMock: vi.fn(),
    itemDeleteMock: vi.fn(),
    settleMock: vi.fn(),
    confirmMock: vi.fn(),
  }));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => useSessionMock(),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ groupId: "g1" }),
}));
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    groups: {
      ":groupId": {
        items: {
          $get: (...args: unknown[]) => itemsGetMock(...args),
          ":itemId": { $delete: (...args: unknown[]) => itemDeleteMock(...args) },
        },
        members: { $get: (...args: unknown[]) => membersGetMock(...args) },
        settlements: { $post: (...args: unknown[]) => settleMock(...args) },
      },
    },
  },
}));

import UnsettledItemsPage from "./page";

Object.defineProperty(window, "confirm", { value: confirmMock, configurable: true });

const loggedIn = { data: { user: { id: "owner", email: "me@example.com" } }, isPending: false };

// owner が 1000 立替、owner/friend で 500 ずつ負担する 1 件。
const lunchItem = {
  id: "i1",
  name: "ランチ",
  purchasedOn: "2026-06-01T00:00:00.000Z",
  memo: null,
  status: "unsettled",
  total: 1000,
  payments: [{ userId: "owner", amount: 1000 }],
  shares: [
    { userId: "owner", amount: 500 },
    { userId: "friend", amount: 500 },
  ],
};

const members = {
  members: [
    { userId: "owner", name: "オーナー", email: "o@example.com", role: "owner", joinedAt: "x" },
    { userId: "friend", name: "フレンド", email: "f@example.com", role: "member", joinedAt: "y" },
  ],
};

beforeEach(() => {
  confirmMock.mockReturnValue(true);
  membersGetMock.mockResolvedValue({ ok: true, json: async () => members });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

test("未ログイン時はサインインへの導線を表示する", () => {
  useSessionMock.mockReturnValue({ data: null, isPending: false });
  renderWithClient(<UnsettledItemsPage />);
  expect(screen.getByText("サインインへ")).toBeInTheDocument();
});

test("未精算アイテムが品名・購入日・合計金額付きで一覧表示される", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [lunchItem] }) });

  renderWithClient(<UnsettledItemsPage />);

  expect(await screen.findByText("ランチ")).toBeInTheDocument();
  expect(screen.getByText("2026-06-01")).toBeInTheDocument();
  expect(screen.getByText("1000 円")).toBeInTheDocument();
});

test("0 件のときは空表示になる", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });

  renderWithClient(<UnsettledItemsPage />);

  expect(await screen.findByText("未精算のアイテムはありません。")).toBeInTheDocument();
});

test("選択すると送金リスト（誰 → 誰 / 金額）が表示される", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [lunchItem] }) });

  renderWithClient(<UnsettledItemsPage />);

  await userEvent.click(await screen.findByLabelText("ランチ を選択"));

  // friend が owner に 500 円。
  const list = await screen.findByText("フレンド → オーナー");
  expect(list).toBeInTheDocument();
  expect(within(list.closest("li") as HTMLElement).getByText("500 円")).toBeInTheDocument();
});

test("精算するとボタンで選択 id が settlements に送られる", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [lunchItem] }) });
  settleMock.mockResolvedValue({ ok: true, json: async () => ({ settled: ["i1"] }) });

  renderWithClient(<UnsettledItemsPage />);

  await userEvent.click(await screen.findByLabelText("ランチ を選択"));
  await userEvent.click(screen.getByRole("button", { name: /精算する/ }));

  await waitFor(() => {
    expect(settleMock).toHaveBeenCalledWith({
      param: { groupId: "g1" },
      json: { itemIds: ["i1"] },
    });
  });
});

test("精算が 0 件更新だったら警告を表示する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [lunchItem] }) });
  settleMock.mockResolvedValue({ ok: true, json: async () => ({ settled: [] }) });

  renderWithClient(<UnsettledItemsPage />);

  await userEvent.click(await screen.findByLabelText("ランチ を選択"));
  await userEvent.click(screen.getByRole("button", { name: /精算する/ }));

  expect(await screen.findByText(/精算対象がありませんでした/)).toBeInTheDocument();
});

test("削除ボタンで該当アイテムの DELETE が呼ばれる", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [lunchItem] }) });
  itemDeleteMock.mockResolvedValue({ ok: true, json: async () => ({ deleted: true }) });

  renderWithClient(<UnsettledItemsPage />);

  await screen.findByText("ランチ");
  await userEvent.click(screen.getByRole("button", { name: "削除" }));

  await waitFor(() => {
    expect(itemDeleteMock).toHaveBeenCalledWith({ param: { groupId: "g1", itemId: "i1" } });
  });
});
