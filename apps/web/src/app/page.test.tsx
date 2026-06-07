import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { renderWithClient } from "@/test/render-with-client";

// auth-client をモックする。vi.hoisted で巻き上げ順の問題を回避する。
const { useSessionMock, groupsGetMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  groupsGetMock: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  useSession: () => useSessionMock(),
}));

// 所属グループ一覧の取得（useGroups → apiClient.groups.$get）をモックする。
// UnauthorizedError は use-groups が 401 時に参照するため、モックにも実体を持たせる。
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    groups: { $get: (...args: unknown[]) => groupsGetMock(...args) },
  },
  UnauthorizedError: class extends Error {},
}));

// AuthPanel の内部は auth-panel.test.tsx が担うため、ここでは差し替えて配置だけを検証する。
vi.mock("./auth-panel", () => ({
  AuthPanel: () => <div>認証パネル</div>,
}));

// クイック入力の内部は quick-item-entry.test.tsx が担うため、ここでは配置だけを検証する。
vi.mock("./quick-item-entry", () => ({
  QuickItemEntry: ({ groupId, groupName }: { groupId: string; groupName: string }) => (
    <div>
      クイック入力フォーム: {groupName} ({groupId})
    </div>
  ),
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

// セッション状態表示の文言・導線は session-states.test.tsx が担うため、ここでは配置だけを検証する。
vi.mock("@/components/session-states", () => ({
  SessionPending: () => <div>セッション確認中画面</div>,
  SessionError: () => <div>セッションエラー画面</div>,
}));

import Home from "./page";

// 各テスト後にレンダリング結果を破棄し、モックの呼び出し履歴もクリアする。
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const loggedIn = {
  data: { user: { email: "me@example.com" } },
  isPending: false,
  error: null,
};

function setGroups(
  groups: { id: string; name: string; role: string }[],
  currentGroupId: string | null = null,
) {
  groupsGetMock.mockResolvedValue({ ok: true, json: async () => ({ groups, currentGroupId }) });
}

test("セッション確認中はローディング表示を出す", () => {
  useSessionMock.mockReturnValue({ data: null, isPending: true });

  renderWithClient(<Home />);

  expect(screen.getByText("セッション確認中画面")).toBeInTheDocument();
});

test("セッション取得に失敗したらエラー表示を出す", () => {
  useSessionMock.mockReturnValue({
    data: null,
    isPending: false,
    error: { status: 500 },
    refetch: vi.fn(),
  });

  renderWithClient(<Home />);

  expect(screen.getByText("セッションエラー画面")).toBeInTheDocument();
  expect(screen.queryByText("認証パネル")).not.toBeInTheDocument();
});

test("未ログイン時は見出しと認証フォームを表示し、ナビは出さない", () => {
  useSessionMock.mockReturnValue({ data: null, isPending: false, error: null });

  renderWithClient(<Home />);

  expect(screen.getByRole("heading", { name: "warikan" })).toBeInTheDocument();
  expect(screen.getByText("認証パネル")).toBeInTheDocument();
  expect(screen.queryByText(/メインナビ/)).not.toBeInTheDocument();
});

test("所属グループが 0 件なら作成への誘導とナビ（選択なし）を表示する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setGroups([]);

  renderWithClient(<Home />);

  expect(
    await screen.findByText(
      "まだグループがありません。グループを作成して購入品の入力を始めましょう。",
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "グループを作成" })).toHaveAttribute("href", "/groups");
  expect(screen.getByText("メインナビ: 選択なし / entry")).toBeInTheDocument();
  expect(screen.queryByText(/クイック入力フォーム/)).not.toBeInTheDocument();
});

test("所属グループが 1 件ならそのグループのクイック入力を表示する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setGroups([{ id: "g1", name: "旅行", role: "owner" }]);

  renderWithClient(<Home />);

  expect(await screen.findByText("クイック入力フォーム: 旅行 (g1)")).toBeInTheDocument();
  expect(screen.getByText("メインナビ: g1 / entry")).toBeInTheDocument();
});

test("複数グループ所属時はカレントグループのクイック入力を表示する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setGroups(
    [
      { id: "g1", name: "旅行", role: "owner" },
      { id: "g2", name: "飲み会", role: "member" },
    ],
    "g2",
  );

  renderWithClient(<Home />);

  expect(await screen.findByText("クイック入力フォーム: 飲み会 (g2)")).toBeInTheDocument();
  expect(screen.getByText("メインナビ: g2 / entry")).toBeInTheDocument();
});

test("カレント未記録（currentGroupId が null）なら先頭グループへフォールバックする", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setGroups(
    [
      { id: "g1", name: "旅行", role: "owner" },
      { id: "g2", name: "飲み会", role: "member" },
    ],
    null,
  );

  renderWithClient(<Home />);

  expect(await screen.findByText("クイック入力フォーム: 旅行 (g1)")).toBeInTheDocument();
});

test("グループ一覧の取得に失敗したらエラーを表示し、クイック入力は出さない", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  groupsGetMock.mockResolvedValue({ ok: false, json: async () => ({}) });

  renderWithClient(<Home />);

  expect(await screen.findByText("グループ一覧の取得に失敗しました。")).toBeInTheDocument();
  expect(screen.queryByText(/クイック入力フォーム/)).not.toBeInTheDocument();
});

test("未ログインでも groups は並列発火し、401 でも認証フォームにエラーを出さない", async () => {
  useSessionMock.mockReturnValue({ data: null, isPending: false, error: null });
  groupsGetMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });

  renderWithClient(<Home />);

  // セッション解決を待たずに発火している（直列 3 往復 → 2 往復の前提）。
  expect(groupsGetMock).toHaveBeenCalledTimes(1);
  expect(await screen.findByText("認証パネル")).toBeInTheDocument();
  // 401 は未ログインの正常系なのでエラー文言は出さない。
  expect(screen.queryByText("グループ一覧の取得に失敗しました。")).not.toBeInTheDocument();
});
