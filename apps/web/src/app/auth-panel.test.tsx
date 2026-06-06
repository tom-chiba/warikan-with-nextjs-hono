import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

// auth-client をモックする。
vi.mock("@/lib/auth-client", () => ({
  signIn: { email: vi.fn() },
  signUp: { email: vi.fn() },
}));

import { AuthPanel } from "./auth-panel";

// 各テスト後にレンダリング結果を破棄し、モックの呼び出し履歴もクリアする。
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("サインアップ/サインインのフォームを表示する", () => {
  render(<AuthPanel />);

  expect(screen.getByLabelText("名前")).toBeInTheDocument();
  expect(screen.getByLabelText("メールアドレス")).toBeInTheDocument();
  expect(screen.getByLabelText("パスワード")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "サインアップ" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "サインイン" })).toBeInTheDocument();
});
