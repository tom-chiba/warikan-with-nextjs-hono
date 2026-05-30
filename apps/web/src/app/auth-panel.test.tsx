import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

// auth-client をモックする。vi.hoisted で巻き上げ順の問題を回避する。
const { useSessionMock } = vi.hoisted(() => ({ useSessionMock: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({
  useSession: () => useSessionMock(),
  signIn: { email: vi.fn() },
  signUp: { email: vi.fn() },
  signOut: vi.fn(),
}));

import { AuthPanel } from "./auth-panel";

test("未ログイン時はサインアップ/サインインのフォームを表示する", () => {
  useSessionMock.mockReturnValue({ data: null, isPending: false });

  render(<AuthPanel />);

  expect(screen.getByLabelText("メールアドレス")).toBeInTheDocument();
  expect(screen.getByLabelText("パスワード")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "サインアップ" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "サインイン" })).toBeInTheDocument();
});

test("ログイン中はメールアドレスとサインアウトを表示する", () => {
  useSessionMock.mockReturnValue({
    data: { user: { email: "me@example.com" } },
    isPending: false,
  });

  render(<AuthPanel />);

  expect(screen.getByText("me@example.com")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "サインアウト" })).toBeInTheDocument();
});
