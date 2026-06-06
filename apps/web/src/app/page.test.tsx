import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

// auth-client をモックする。vi.hoisted で巻き上げ順の問題を回避する。
const { useSessionMock } = vi.hoisted(() => ({ useSessionMock: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({
  useSession: () => useSessionMock(),
  signOut: vi.fn(),
}));

// AuthPanel の内部は auth-panel.test.tsx が担うため、ここでは差し替えて配置だけを検証する。
vi.mock("./auth-panel", () => ({
  AuthPanel: () => <div>認証パネル</div>,
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

test("セッション確認中はローディング表示を出す", () => {
  useSessionMock.mockReturnValue({ data: null, isPending: true });

  render(<Home />);

  expect(screen.getByText("セッション確認中画面")).toBeInTheDocument();
});

test("セッション取得に失敗したらエラー表示を出す", () => {
  useSessionMock.mockReturnValue({
    data: null,
    isPending: false,
    error: { status: 500 },
    refetch: vi.fn(),
  });

  render(<Home />);

  expect(screen.getByText("セッションエラー画面")).toBeInTheDocument();
  expect(screen.queryByText("認証パネル")).not.toBeInTheDocument();
});

test("未ログイン時は見出しと認証フォームを表示する", () => {
  useSessionMock.mockReturnValue({ data: null, isPending: false, error: null });

  render(<Home />);

  expect(screen.getByRole("heading", { name: "warikan" })).toBeInTheDocument();
  expect(screen.getByText("認証パネル")).toBeInTheDocument();
});

test("ログイン済み時はメールアドレスと各導線を表示する", () => {
  useSessionMock.mockReturnValue({
    data: { user: { email: "me@example.com" } },
    isPending: false,
    error: null,
  });

  render(<Home />);

  expect(screen.getByText("me@example.com")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "グループ" })).toHaveAttribute("href", "/groups");
  expect(screen.getByRole("link", { name: "アカウント設定" })).toHaveAttribute("href", "/settings");
  expect(screen.getByRole("button", { name: "サインアウト" })).toBeInTheDocument();
  expect(screen.queryByText("認証パネル")).not.toBeInTheDocument();
});
