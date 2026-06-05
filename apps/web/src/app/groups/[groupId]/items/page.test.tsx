import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const {
  useSessionMock,
  itemsGetMock,
  membersGetMock,
  itemDeleteMock,
  settleMock,
  unsettleMock,
  searchParamsMock,
  confirmMock,
} = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  itemsGetMock: vi.fn(),
  membersGetMock: vi.fn(),
  itemDeleteMock: vi.fn(),
  settleMock: vi.fn(),
  unsettleMock: vi.fn(),
  searchParamsMock: vi.fn(),
  confirmMock: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => useSessionMock(),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ groupId: "g1" }),
  useSearchParams: () => searchParamsMock(),
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
        unsettlements: { $post: (...args: unknown[]) => unsettleMock(...args) },
      },
    },
  },
}));

import ItemsPage from "./page";

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
  // 既定は未精算ビュー（クエリパラメータなし）。
  searchParamsMock.mockReturnValue(new URLSearchParams(""));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

test("未ログイン時はサインインへの導線を表示する", async () => {
  useSessionMock.mockReturnValue({ data: null, isPending: false });
  renderWithClient(<ItemsPage />);
  expect(await screen.findByText("サインインへ")).toBeInTheDocument();
});

test("未精算アイテムが品名・購入日・合計金額付きで一覧表示される", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [lunchItem] }) });

  renderWithClient(<ItemsPage />);

  expect(await screen.findByText("ランチ")).toBeInTheDocument();
  expect(screen.getByText("2026-06-01")).toBeInTheDocument();
  expect(screen.getByText("1000 円")).toBeInTheDocument();
});

test("0 件のときは空表示になる", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });

  renderWithClient(<ItemsPage />);

  expect(await screen.findByText("未精算のアイテムはありません。")).toBeInTheDocument();
});

test("選択すると送金リスト（誰 → 誰 / 金額）が表示される", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [lunchItem] }) });

  renderWithClient(<ItemsPage />);

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

  renderWithClient(<ItemsPage />);

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

  renderWithClient(<ItemsPage />);

  await userEvent.click(await screen.findByLabelText("ランチ を選択"));
  await userEvent.click(screen.getByRole("button", { name: /精算する/ }));

  expect(await screen.findByText(/精算対象がありませんでした/)).toBeInTheDocument();
});

test("削除ボタンで該当アイテムの DELETE が呼ばれる", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [lunchItem] }) });
  itemDeleteMock.mockResolvedValue({ ok: true, json: async () => ({ deleted: true }) });

  renderWithClient(<ItemsPage />);

  await screen.findByText("ランチ");
  await userEvent.click(screen.getByRole("button", { name: "削除" }));

  await waitFor(() => {
    expect(itemDeleteMock).toHaveBeenCalledWith({ param: { groupId: "g1", itemId: "i1" } });
  });
});

// ---- 精算済ビュー（?status=settled）----

const settledItem = { ...lunchItem, status: "settled" };

function renderSettledView() {
  searchParamsMock.mockReturnValue(new URLSearchParams("status=settled"));
  return renderWithClient(<ItemsPage />);
}

test("精算済ビューではアイテムが表示され、選択チェックボックスは無い", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [settledItem] }) });

  renderSettledView();

  expect(await screen.findByText("ランチ")).toBeInTheDocument();
  expect(screen.getByText("1000 円")).toBeInTheDocument();
  // 精算対象の選択は未精算ビュー専用。
  expect(screen.queryByLabelText("ランチ を選択")).not.toBeInTheDocument();
  // status=settled で一覧を取得している。
  expect(itemsGetMock).toHaveBeenCalledWith({
    param: { groupId: "g1" },
    query: { status: "settled" },
  });
  // 編集リンクは遷移元（精算済）を ?from で伝える。
  expect(screen.getByRole("link", { name: "編集" })).toHaveAttribute(
    "href",
    "/groups/g1/items/i1/edit?from=settled",
  );
});

test("精算済が 0 件のときは空表示になる", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });

  renderSettledView();

  expect(await screen.findByText("精算済のアイテムはありません。")).toBeInTheDocument();
});

test("未精算に戻すボタンで該当 id が unsettlements に送られる", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [settledItem] }) });
  unsettleMock.mockResolvedValue({ ok: true, json: async () => ({ unsettled: ["i1"] }) });

  renderSettledView();

  await screen.findByText("ランチ");
  await userEvent.click(screen.getByRole("button", { name: "未精算に戻す" }));

  await waitFor(() => {
    expect(unsettleMock).toHaveBeenCalledWith({
      param: { groupId: "g1" },
      json: { itemIds: ["i1"] },
    });
  });
});

test("未精算に戻すが 0 件更新だったら警告を表示する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [settledItem] }) });
  unsettleMock.mockResolvedValue({ ok: true, json: async () => ({ unsettled: [] }) });

  renderSettledView();

  await screen.findByText("ランチ");
  await userEvent.click(screen.getByRole("button", { name: "未精算に戻す" }));

  expect(await screen.findByText(/対象がありませんでした/)).toBeInTheDocument();
});

test("精算済ビューでも削除ボタンで該当アイテムの DELETE が呼ばれる", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [settledItem] }) });
  itemDeleteMock.mockResolvedValue({ ok: true, json: async () => ({ deleted: true }) });

  renderSettledView();

  await screen.findByText("ランチ");
  await userEvent.click(screen.getByRole("button", { name: "削除" }));

  await waitFor(() => {
    expect(itemDeleteMock).toHaveBeenCalledWith({ param: { groupId: "g1", itemId: "i1" } });
  });
});
