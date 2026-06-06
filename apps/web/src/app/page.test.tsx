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

import Home from "./page";

// 各テスト後にレンダリング結果を破棄し、モックの呼び出し履歴もクリアする。
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("セッション確認中はローディング表示を出す", () => {
  useSessionMock.mockReturnValue({ data: null, isPending: true });

  render(<Home />);

  expect(screen.getByText("セッション確認中…")).toBeInTheDocument();
});

test("未ログイン時は見出しと認証フォームを表示する", () => {
  useSessionMock.mockReturnValue({ data: null, isPending: false });

  render(<Home />);

  expect(screen.getByRole("heading", { name: "warikan" })).toBeInTheDocument();
  expect(screen.getByText("認証パネル")).toBeInTheDocument();
});

test("ログイン済み時はメールアドレスと各導線を表示する", () => {
  useSessionMock.mockReturnValue({
    data: { user: { email: "me@example.com" } },
    isPending: false,
  });

  render(<Home />);

  expect(screen.getByText("me@example.com")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "グループ" })).toHaveAttribute("href", "/groups");
  expect(screen.getByRole("link", { name: "アカウント設定" })).toHaveAttribute("href", "/settings");
  expect(screen.getByRole("button", { name: "サインアウト" })).toBeInTheDocument();
  expect(screen.queryByText("認証パネル")).not.toBeInTheDocument();
});
