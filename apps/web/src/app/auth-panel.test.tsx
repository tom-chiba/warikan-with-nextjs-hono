import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

// auth-client をモックする。
vi.mock("@/lib/auth-client", () => ({
  signIn: { email: vi.fn() },
  signUp: { email: vi.fn() },
}));

import { signIn, signUp } from "@/lib/auth-client";
import { AuthPanel } from "./auth-panel";

// 各テスト後にレンダリング結果を破棄し、モックの呼び出し履歴もクリアする。
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("初期表示はサインインで、名前フィールドを表示しない", () => {
  render(<AuthPanel />);

  expect(screen.queryByLabelText("名前")).not.toBeInTheDocument();
  expect(screen.getByLabelText("メールアドレス")).toBeInTheDocument();
  expect(screen.getByLabelText("パスワード")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "サインイン" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "サインイン" })).toHaveAttribute("aria-selected", "true");
});

test("サインアップタブへ切り替えると名前フィールド（必須）を表示する", async () => {
  const user = userEvent.setup();
  render(<AuthPanel />);

  await user.click(screen.getByRole("tab", { name: "サインアップ" }));

  expect(screen.getByLabelText("名前")).toBeRequired();
  expect(screen.getByRole("button", { name: "サインアップ" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "サインアップ" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("サインインを送信すると signIn.email を呼ぶ（name は送らない）", async () => {
  const user = userEvent.setup();
  vi.mocked(signIn.email).mockResolvedValue({ error: null } as never);
  render(<AuthPanel />);

  await user.type(screen.getByLabelText("メールアドレス"), "taro@example.com");
  await user.type(screen.getByLabelText("パスワード"), "password123");
  await user.click(screen.getByRole("button", { name: "サインイン" }));

  expect(signIn.email).toHaveBeenCalledWith({
    email: "taro@example.com",
    password: "password123",
  });
  expect(signUp.email).not.toHaveBeenCalled();
});

test("サインアップを送信すると signUp.email を name 付きで呼ぶ", async () => {
  const user = userEvent.setup();
  vi.mocked(signUp.email).mockResolvedValue({ error: null } as never);
  render(<AuthPanel />);

  await user.click(screen.getByRole("tab", { name: "サインアップ" }));
  await user.type(screen.getByLabelText("名前"), "太郎");
  await user.type(screen.getByLabelText("メールアドレス"), "taro@example.com");
  await user.type(screen.getByLabelText("パスワード"), "password123");
  await user.click(screen.getByRole("button", { name: "サインアップ" }));

  expect(signUp.email).toHaveBeenCalledWith({
    name: "太郎",
    email: "taro@example.com",
    password: "password123",
  });
  expect(signIn.email).not.toHaveBeenCalled();
});

test("defaultMode=signUp なら初期表示がサインアップになる", () => {
  render(<AuthPanel defaultMode="signUp" />);

  expect(screen.getByLabelText("名前")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "サインアップ" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("空白のみの名前ではサインアップを送信せずエラーを表示する", async () => {
  const user = userEvent.setup();
  render(<AuthPanel defaultMode="signUp" />);

  await user.type(screen.getByLabelText("名前"), "   ");
  await user.type(screen.getByLabelText("メールアドレス"), "taro@example.com");
  await user.type(screen.getByLabelText("パスワード"), "password123");
  await user.click(screen.getByRole("button", { name: "サインアップ" }));

  expect(screen.getByText("名前を入力してください")).toBeInTheDocument();
  expect(signUp.email).not.toHaveBeenCalled();
});

test("名前の前後の空白は trim して送信する", async () => {
  const user = userEvent.setup();
  vi.mocked(signUp.email).mockResolvedValue({ error: null } as never);
  render(<AuthPanel defaultMode="signUp" />);

  await user.type(screen.getByLabelText("名前"), " 太郎 ");
  await user.type(screen.getByLabelText("メールアドレス"), "taro@example.com");
  await user.type(screen.getByLabelText("パスワード"), "password123");
  await user.click(screen.getByRole("button", { name: "サインアップ" }));

  expect(signUp.email).toHaveBeenCalledWith({
    name: "太郎",
    email: "taro@example.com",
    password: "password123",
  });
});

test("矢印キーでタブを切り替えられる（WAI-ARIA タブパターン）", async () => {
  const user = userEvent.setup();
  render(<AuthPanel />);

  screen.getByRole("tab", { name: "サインイン" }).focus();
  await user.keyboard("{ArrowRight}");

  expect(screen.getByRole("tab", { name: "サインアップ" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByRole("tab", { name: "サインアップ" })).toHaveFocus();

  await user.keyboard("{ArrowLeft}");
  expect(screen.getByRole("tab", { name: "サインイン" })).toHaveAttribute("aria-selected", "true");
});

test("送信中はタブを切り替えない（在庫中の結果が別タブに出るのを防ぐ）", async () => {
  const user = userEvent.setup();
  // 解決を保留したままにして送信中状態を作る。
  let resolveSignIn: (v: { error: null }) => void = () => {};
  vi.mocked(signIn.email).mockReturnValue(
    new Promise((resolve) => {
      resolveSignIn = resolve;
    }) as never,
  );
  render(<AuthPanel />);

  await user.type(screen.getByLabelText("メールアドレス"), "taro@example.com");
  await user.type(screen.getByLabelText("パスワード"), "password123");
  await user.click(screen.getByRole("button", { name: "サインイン" }));

  await user.click(screen.getByRole("tab", { name: "サインアップ" }));
  expect(screen.getByRole("tab", { name: "サインイン" })).toHaveAttribute("aria-selected", "true");

  // 解決後は切り替えられる。
  resolveSignIn({ error: null });
  await user.click(screen.getByRole("tab", { name: "サインアップ" }));
  expect(screen.getByRole("tab", { name: "サインアップ" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("タブを切り替えるとエラー表示をクリアする", async () => {
  const user = userEvent.setup();
  vi.mocked(signIn.email).mockResolvedValue({
    error: { message: "認証に失敗しました" },
  } as never);
  render(<AuthPanel />);

  await user.type(screen.getByLabelText("メールアドレス"), "taro@example.com");
  await user.type(screen.getByLabelText("パスワード"), "wrong");
  await user.click(screen.getByRole("button", { name: "サインイン" }));
  expect(screen.getByText("認証に失敗しました")).toBeInTheDocument();

  await user.click(screen.getByRole("tab", { name: "サインアップ" }));
  expect(screen.queryByText("認証に失敗しました")).not.toBeInTheDocument();
});
