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
  signOut: vi.fn(),
}));

// 所属グループ一覧の取得（useGroups → apiClient.groups.$get）をモックする。
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    groups: { $get: (...args: unknown[]) => groupsGetMock(...args) },
  },
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

function setGroups(groups: { id: string; name: string; role: string }[]) {
  groupsGetMock.mockResolvedValue({ ok: true, json: async () => ({ groups }) });
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

test("未ログイン時は見出しと認証フォームを表示する", () => {
  useSessionMock.mockReturnValue({ data: null, isPending: false, error: null });

  renderWithClient(<Home />);

  expect(screen.getByRole("heading", { name: "warikan" })).toBeInTheDocument();
  expect(screen.getByText("認証パネル")).toBeInTheDocument();
});

test("ログイン済み時はメールアドレスと各導線を表示する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setGroups([]);

  renderWithClient(<Home />);

  // グループ取得の完了まで待ち、確定後の画面に対して検証する。
  await screen.findByRole("link", { name: "グループを作成" });
  expect(screen.getByText("me@example.com")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "グループ" })).toHaveAttribute("href", "/groups");
  expect(screen.getByRole("link", { name: "アカウント設定" })).toHaveAttribute("href", "/settings");
  expect(screen.getByRole("button", { name: "サインアウト" })).toBeInTheDocument();
  expect(screen.queryByText("認証パネル")).not.toBeInTheDocument();
});

test("所属グループが 0 件なら作成への誘導を表示する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setGroups([]);

  renderWithClient(<Home />);

  expect(
    await screen.findByText(
      "まだグループがありません。グループを作成して購入品の入力を始めましょう。",
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "グループを作成" })).toHaveAttribute("href", "/groups");
  expect(screen.queryByText(/クイック入力フォーム/)).not.toBeInTheDocument();
});

test("所属グループが 1 件ならそのグループのクイック入力を表示する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setGroups([{ id: "g1", name: "旅行", role: "owner" }]);

  renderWithClient(<Home />);

  expect(await screen.findByText("クイック入力フォーム: 旅行 (g1)")).toBeInTheDocument();
});

test("所属グループが複数ならグループ選択への誘導を表示する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setGroups([
    { id: "g1", name: "旅行", role: "owner" },
    { id: "g2", name: "飲み会", role: "member" },
  ]);

  renderWithClient(<Home />);

  expect(await screen.findByRole("link", { name: "グループを選んで入力" })).toHaveAttribute(
    "href",
    "/groups",
  );
  expect(screen.queryByText(/クイック入力フォーム/)).not.toBeInTheDocument();
});

test("グループ一覧の取得に失敗したらエラーを表示し、クイック入力は出さない", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  groupsGetMock.mockResolvedValue({ ok: false, json: async () => ({}) });

  renderWithClient(<Home />);

  expect(await screen.findByText("グループ一覧の取得に失敗しました。")).toBeInTheDocument();
  expect(screen.queryByText(/クイック入力フォーム/)).not.toBeInTheDocument();
});
