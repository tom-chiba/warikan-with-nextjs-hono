import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { renderWithClient } from "@/test/render-with-client";

const {
  useSessionMock,
  itemsGetMock,
  membersGetMock,
  itemDeleteMock,
  settleMock,
  unsettleMock,
  searchParamsMock,
  confirmMock,
  groupsGetMock,
  lastViewedPutMock,
} = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  itemsGetMock: vi.fn(),
  membersGetMock: vi.fn(),
  itemDeleteMock: vi.fn(),
  settleMock: vi.fn(),
  unsettleMock: vi.fn(),
  searchParamsMock: vi.fn(),
  confirmMock: vi.fn(),
  groupsGetMock: vi.fn(),
  lastViewedPutMock: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => useSessionMock(),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ groupId: "g1" }),
  useSearchParams: () => searchParamsMock(),
}));
vi.mock("@/lib/api-client", () => ({
  // use-groups が 401 時に参照する実体もモックに持たせる（欠けると 401 系テスト追加時に new undefined() で落ちる）。
  UnauthorizedError: class extends Error {},
  apiClient: {
    groups: {
      $get: (...args: unknown[]) => groupsGetMock(...args),
      ":groupId": {
        items: {
          $get: (...args: unknown[]) => itemsGetMock(...args),
          ":itemId": { $delete: (...args: unknown[]) => itemDeleteMock(...args) },
        },
        members: { $get: (...args: unknown[]) => membersGetMock(...args) },
        settlements: { $post: (...args: unknown[]) => settleMock(...args) },
        unsettlements: { $post: (...args: unknown[]) => unsettleMock(...args) },
        "last-viewed": { $put: (...args: unknown[]) => lastViewedPutMock(...args) },
      },
    },
  },
}));
// MainNav の内部は main-nav.test.tsx が担うため、渡された props の確認に留める。
vi.mock("@/components/main-nav", () => ({
  MainNav: ({
    selectedGroupId,
    activeTab,
  }: {
    selectedGroupId: string | null;
    activeTab: string;
  }) => (
    <div>
      メインナビ: {selectedGroupId ?? "選択なし"} / {activeTab}
    </div>
  ),
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
  kind: "expense",
  total: 1000,
  payments: [{ userId: "owner", amount: 1000 }],
  shares: [
    { userId: "owner", amount: 500 },
    { userId: "friend", amount: 500 },
  ],
};

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

beforeEach(() => {
  confirmMock.mockReturnValue(true);
  membersGetMock.mockResolvedValue({ ok: true, json: async () => members });
  // 既定は未精算ビュー（クエリパラメータなし）。
  searchParamsMock.mockReturnValue(new URLSearchParams(""));
  // MainNav 用のグループ一覧。既定では表示中の g1 がカレント（last-viewed 同期は走らない）。
  groupsGetMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      groups: [{ id: "g1", name: "旅行", role: "owner" }],
      currentGroupId: "g1",
    }),
  });
  lastViewedPutMock.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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
  expect(screen.getByText("−1,000 円")).toBeInTheDocument();
});

test("収入アイテムは合計金額が + 付き・緑色で表示される（収入分配機能）", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  const incomeItem = {
    ...lunchItem,
    id: "i2",
    name: "臨時給付金",
    kind: "income",
    total: 120000,
  };
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [incomeItem] }) });

  renderWithClient(<ItemsPage />);

  const amount = await screen.findByText("+120,000 円");
  expect(amount).toBeInTheDocument();
  expect(amount).toHaveClass("text-ok");
});

test("0 件のときは空表示になる", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });

  renderWithClient(<ItemsPage />);

  expect(await screen.findByText("未精算のアイテムはありません。")).toBeInTheDocument();
});

// 選択後に画面下へ出るサマリーバーをタップして、送金リストのシートを開く。
async function openSettlementSheet() {
  await userEvent.click(screen.getByRole("button", { name: /送金リスト/ }));
  return screen.findByRole("dialog", { name: "送金リスト" });
}

test("選択すると画面下のサマリーバーに最大の送金が出て、タップで送金リスト（誰 → 誰 / 金額）が開く", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [lunchItem] }) });

  renderWithClient(<ItemsPage />);

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await userEvent.click(await screen.findByLabelText("ランチ を選択"));

  // バーには選択件数・送金件数と、最大の送金（friend が owner に 500 円）だけが出る。
  const bar = screen.getByRole("button", { name: /送金リスト/ });
  expect(within(bar).getByText("選択 1 件 · 送金 1 件")).toBeInTheDocument();
  expect(within(bar).getByText("フレンド → オーナー 500 円")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  const sheet = await openSettlementSheet();
  const list = within(sheet).getByText("フレンド → オーナー");
  expect(within(list.closest("li") as HTMLElement).getByText("500 円")).toBeInTheDocument();
});

test("送金が複数あるときバーには最大の送金と「ほか N 件」が出る", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  // 3 人目を加え、owner が 3000 立替・負担は 600 / 1000 / 1400 → フレンド 1,000 円・タロウ 1,400 円を owner に送る。
  membersGetMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      members: [
        ...members.members,
        {
          userId: "taro",
          name: "タロウ",
          displayName: null,
          email: "t@example.com",
          role: "member",
          joinedAt: "z",
        },
      ],
    }),
  });
  const groupItem = {
    ...lunchItem,
    total: 3000,
    payments: [{ userId: "owner", amount: 3000 }],
    shares: [
      { userId: "owner", amount: 600 },
      { userId: "friend", amount: 1000 },
      { userId: "taro", amount: 1400 },
    ],
  };
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [groupItem] }) });

  renderWithClient(<ItemsPage />);

  await userEvent.click(await screen.findByLabelText("ランチ を選択"));

  const bar = await screen.findByRole("button", { name: /送金リスト/ });
  expect(within(bar).getByText("選択 1 件 · 送金 2 件")).toBeInTheDocument();
  // 最大額（タロウ → オーナー 1,400 円）が選ばれ、残りは件数で示される。
  expect(within(bar).getByText("タロウ → オーナー 1,400 円 ほか 1 件")).toBeInTheDocument();
});

test("送金リストのシートは閉じるボタンと Escape で閉じ、バーにフォーカスが戻る", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [lunchItem] }) });

  renderWithClient(<ItemsPage />);

  await userEvent.click(await screen.findByLabelText("ランチ を選択"));

  const sheet = await openSettlementSheet();
  // 開いている間は背面のスクロールを止め、閉じるボタンにフォーカスが移る。
  expect(document.body.style.overflow).toBe("hidden");
  expect(within(sheet).getByRole("button", { name: "閉じる" })).toHaveFocus();

  await userEvent.click(within(sheet).getByRole("button", { name: "閉じる" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.body.style.overflow).not.toBe("hidden");
  // 閉じても選択は保たれ、フォーカスは開いたバーに戻り、バーから開き直せる。
  expect(screen.getByLabelText("ランチ を選択")).toBeChecked();
  expect(screen.getByRole("button", { name: /送金リスト/ })).toHaveFocus();

  await openSettlementSheet();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /送金リスト/ })).toBeInTheDocument();
});

test("送金リストのシートは暗幕のタップでも閉じる", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [lunchItem] }) });

  renderWithClient(<ItemsPage />);

  await userEvent.click(await screen.findByLabelText("ランチ を選択"));

  const sheet = await openSettlementSheet();
  // 暗幕は装飾（aria-hidden）なので、ダイアログの直前の兄弟要素として取得する。
  await userEvent.click(sheet.previousElementSibling as HTMLElement);

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByLabelText("ランチ を選択")).toBeChecked();
});

test("選択分の収支が均衡しているときはバーに「送金は不要です」、シートに均衡の案内が出る", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  // owner が 1000 立替、owner/friend で 500 ずつ負担する 1 件と、
  // friend が 1000 立替、同じ負担の 1 件を選ぶと収支が相殺する。
  const reverseItem = {
    ...lunchItem,
    id: "i9",
    name: "夕食",
    payments: [{ userId: "friend", amount: 1000 }],
  };
  itemsGetMock.mockResolvedValue({
    ok: true,
    json: async () => ({ items: [lunchItem, reverseItem] }),
  });

  renderWithClient(<ItemsPage />);

  await userEvent.click(await screen.findByLabelText("全て選択"));

  const bar = screen.getByRole("button", { name: /送金リスト/ });
  expect(within(bar).getByText("送金は不要です")).toBeInTheDocument();
  const sheet = await openSettlementSheet();
  expect(within(sheet).getByText(/すでに均衡しています/)).toBeInTheDocument();
});

test("精算するとボタンで選択 id と確認済み送金リストが settlements に送られる", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [lunchItem] }) });
  settleMock.mockResolvedValue({ ok: true, json: async () => ({ settled: ["i1"] }) });

  renderWithClient(<ItemsPage />);

  await userEvent.click(await screen.findByLabelText("ランチ を選択"));
  await openSettlementSheet();
  await userEvent.click(screen.getByRole("button", { name: /精算する/ }));

  await waitFor(() => {
    expect(settleMock).toHaveBeenCalledWith({
      param: { groupId: "g1" },
      // 画面で確認した送金リストも送り、サーバー側で再計算と突き合わせる（ADR-0013）。
      json: { itemIds: ["i1"], transfers: [{ from: "friend", to: "owner", amount: 500 }] },
    });
  });
  // 精算が成功したらシートもバーも消え、選択も解除される。
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  expect(screen.queryByRole("button", { name: /送金リスト/ })).not.toBeInTheDocument();
  expect(screen.getByLabelText("ランチ を選択")).not.toBeChecked();

  // 次の選択でシートが開いたまま復活せず、バーだけが出る。
  await userEvent.click(screen.getByLabelText("ランチ を選択"));
  expect(screen.getByRole("button", { name: /送金リスト/ })).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("シートを開いたまま選択アイテムが一覧から消えたら閉じ、次の選択で開いたまま復活しない", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  // 1 回目の取得はランチのみ。409 後の再取得ではランチが消えてディナーだけになる（他端末で精算済み等）。
  itemsGetMock
    .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [lunchItem] }) })
    .mockResolvedValue({ ok: true, json: async () => ({ items: [dinnerItem] }) });
  settleMock.mockResolvedValue({
    ok: false,
    status: 409,
    json: async () => ({ error: "一覧が古くなっています" }),
  });

  renderWithClient(<ItemsPage />);

  await userEvent.click(await screen.findByLabelText("ランチ を選択"));
  await openSettlementSheet();
  await userEvent.click(screen.getByRole("button", { name: /精算する/ }));

  await waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  expect(screen.queryByRole("button", { name: /送金リスト/ })).not.toBeInTheDocument();

  await userEvent.click(await screen.findByLabelText("ディナー を選択"));
  expect(screen.getByRole("button", { name: /送金リスト/ })).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("収入アイテムを選択すると、受取人が支払う側に反転した送金リストが表示・送信される（収入分配機能）", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  // owner が 900 受け取り、owner/friend で 450 ずつ分担 → owner が friend に 450 円払う側になる。
  const incomeItem = {
    ...lunchItem,
    kind: "income",
    total: 900,
    payments: [{ userId: "owner", amount: 900 }],
    shares: [
      { userId: "owner", amount: 450 },
      { userId: "friend", amount: 450 },
    ],
  };
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [incomeItem] }) });
  settleMock.mockResolvedValue({ ok: true, json: async () => ({ settled: ["i1"] }) });

  renderWithClient(<ItemsPage />);

  await userEvent.click(await screen.findByLabelText("ランチ を選択"));
  await openSettlementSheet();

  const list = await screen.findByText("オーナー → フレンド");
  expect(within(list.closest("li") as HTMLElement).getByText("450 円")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /精算する/ }));

  await waitFor(() => {
    expect(settleMock).toHaveBeenCalledWith({
      param: { groupId: "g1" },
      json: { itemIds: ["i1"], transfers: [{ from: "owner", to: "friend", amount: 450 }] },
    });
  });
});

test("精算が 409（一覧が古い・送金リスト不一致）ならサーバーの理由を表示する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [lunchItem] }) });
  settleMock.mockResolvedValue({
    ok: false,
    status: 409,
    json: async () => ({
      error: "送金リストが最新のデータと一致しません。一覧を最新の状態にしてからやり直してください",
    }),
  });

  renderWithClient(<ItemsPage />);

  await userEvent.click(await screen.findByLabelText("ランチ を選択"));
  await openSettlementSheet();
  await userEvent.click(screen.getByRole("button", { name: /精算する/ }));

  // シートが背面を覆うので、エラーはシート内にも表示される。
  const sheet = await screen.findByRole("dialog", { name: "送金リスト" });
  expect(
    await within(sheet).findByText(/送金リストが最新のデータと一致しません/),
  ).toBeInTheDocument();
});

test("精算が 0 件更新だったら警告を表示する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [lunchItem] }) });
  settleMock.mockResolvedValue({ ok: true, json: async () => ({ settled: [] }) });

  renderWithClient(<ItemsPage />);

  await userEvent.click(await screen.findByLabelText("ランチ を選択"));
  await openSettlementSheet();
  await userEvent.click(screen.getByRole("button", { name: /精算する/ }));

  // シートが背面を覆うので、警告はシート内に表示される（ページ側には重複して出さない）。
  const sheet = await screen.findByRole("dialog", { name: "送金リスト" });
  expect(await within(sheet).findByText(/精算対象がありませんでした/)).toBeInTheDocument();
  expect(screen.getAllByText(/精算対象がありませんでした/)).toHaveLength(1);
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

// ---- 全選択チェックボックス（#49）----

// friend が 2000 立替、owner/friend で 1000 ずつ負担する 1 件（lunchItem と合わせて 2 件で使う）。
const dinnerItem = {
  id: "i2",
  name: "ディナー",
  purchasedOn: "2026-06-02T00:00:00.000Z",
  memo: null,
  status: "unsettled",
  total: 2000,
  payments: [{ userId: "friend", amount: 2000 }],
  shares: [
    { userId: "owner", amount: 1000 },
    { userId: "friend", amount: 1000 },
  ],
};

test("全て選択チェックボックスで全アイテムが選択される", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({
    ok: true,
    json: async () => ({ items: [lunchItem, dinnerItem] }),
  });

  renderWithClient(<ItemsPage />);

  const selectAll = await screen.findByLabelText("全て選択");
  expect(selectAll).not.toBeChecked();

  await userEvent.click(selectAll);

  expect(screen.getByLabelText("ランチ を選択")).toBeChecked();
  expect(screen.getByLabelText("ディナー を選択")).toBeChecked();
  expect(selectAll).toBeChecked();
  // 全 2 件が送金計算の対象になっている（バーの選択件数で確認する）。
  expect(screen.getByText(/選択 2 件/)).toBeInTheDocument();
});

test("全件選択済みで全て選択チェックボックスを押すと全件解除される", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({
    ok: true,
    json: async () => ({ items: [lunchItem, dinnerItem] }),
  });

  renderWithClient(<ItemsPage />);

  const selectAll = await screen.findByLabelText("全て選択");
  await userEvent.click(selectAll);
  await userEvent.click(selectAll);

  expect(screen.getByLabelText("ランチ を選択")).not.toBeChecked();
  expect(screen.getByLabelText("ディナー を選択")).not.toBeChecked();
  expect(selectAll).not.toBeChecked();
  expect(screen.queryByRole("button", { name: /送金リスト/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("一部選択のとき全て選択チェックボックスは indeterminate になり、押すと全件選択される", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({
    ok: true,
    json: async () => ({ items: [lunchItem, dinnerItem] }),
  });

  renderWithClient(<ItemsPage />);

  const selectAll = await screen.findByLabelText<HTMLInputElement>("全て選択");
  expect(selectAll.indeterminate).toBe(false);

  await userEvent.click(screen.getByLabelText("ランチ を選択"));

  expect(selectAll.indeterminate).toBe(true);
  expect(selectAll).not.toBeChecked();

  // 一部選択からの押下は「全件選択」になる。
  await userEvent.click(selectAll);

  expect(selectAll.indeterminate).toBe(false);
  expect(selectAll).toBeChecked();
  expect(screen.getByLabelText("ディナー を選択")).toBeChecked();
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
  expect(screen.getByText("−1,000 円")).toBeInTheDocument();
  // 精算対象の選択は未精算ビュー専用（全選択ヘッダー含む）。
  expect(screen.queryByLabelText("ランチ を選択")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("全て選択")).not.toBeInTheDocument();
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

test("精算済ビューでも収入アイテムは + 付き・緑色で表示される（収入分配機能）", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  const settledIncomeItem = {
    ...settledItem,
    id: "i2",
    name: "臨時給付金",
    kind: "income",
    total: 120000,
  };
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [settledIncomeItem] }) });

  renderSettledView();

  const amount = await screen.findByText("+120,000 円");
  expect(amount).toBeInTheDocument();
  expect(amount).toHaveClass("text-ok");
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

// ---- 常設ナビとカレントグループ同期（#51）----

test("未精算ビューではナビに表示中グループと unsettled タブが渡される", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });

  renderWithClient(<ItemsPage />);

  expect(await screen.findByText("メインナビ: g1 / unsettled")).toBeInTheDocument();
});

test("精算済ビューではナビに settled タブが渡される", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });

  renderSettledView();

  expect(await screen.findByText("メインナビ: g1 / settled")).toBeInTheDocument();
});

test("カレントでないグループを開いたらカレントとして記録する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
  // サーバー上のカレントは g2。URL で開いた g1 がカレントになるよう同期される。
  groupsGetMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      groups: [
        { id: "g1", name: "旅行", role: "owner" },
        { id: "g2", name: "飲み会", role: "member" },
      ],
      currentGroupId: "g2",
    }),
  });

  renderWithClient(<ItemsPage />);

  await waitFor(() => {
    expect(lastViewedPutMock).toHaveBeenCalledWith({ param: { groupId: "g1" } });
  });
});

test("すでにカレントのグループを開いたときは記録を打ち直さない", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });

  renderWithClient(<ItemsPage />);

  await screen.findByText("未精算のアイテムはありません。");
  expect(lastViewedPutMock).not.toHaveBeenCalled();
});

test("所属しないグループの URL を開いたらビューを出さず案内し、カレント記録もしない", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  itemsGetMock.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
  // URL の g1 は所属一覧に存在しない（脱退済み等）。残存グループ g2 をナビに出す。
  groupsGetMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      groups: [{ id: "g2", name: "飲み会", role: "member" }],
      currentGroupId: "g2",
    }),
  });

  renderWithClient(<ItemsPage />);

  expect(await screen.findByText(/このグループのアイテムは表示できません/)).toBeInTheDocument();
  // 脱出経路として残存グループを選択したナビとホームへのリンクを出す。
  expect(screen.getByText("メインナビ: g2 / unsettled")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "ホームへ" })).toHaveAttribute("href", "/");
  expect(screen.queryByText("未精算のアイテムはありません。")).not.toBeInTheDocument();
  expect(lastViewedPutMock).not.toHaveBeenCalled();
});
