import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

// auth-client と next/navigation をモックする。vi.hoisted で巻き上げ順の問題を回避する。
const { useSessionMock, deleteUserMock, pushMock, confirmMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  deleteUserMock: vi.fn(),
  pushMock: vi.fn(),
  confirmMock: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => useSessionMock(),
  authClient: { deleteUser: deleteUserMock },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import SettingsPage from "./page";

Object.defineProperty(window, "confirm", { value: confirmMock, configurable: true });

// confirm は既定で「承認」とし、キャンセルを検証するテストだけ false に上書きする
//（groups/[groupId]/page.test.tsx と同じパターン）。
beforeEach(() => {
  confirmMock.mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const loggedIn = {
  data: { user: { name: "テストユーザー", email: "me@example.com" } },
  isPending: false,
};

// パスワードを入力して「アカウントを削除」を押す共通操作。
async function submitDelete(password = "password1234") {
  await userEvent.type(screen.getByLabelText("確認用パスワード"), password);
  await userEvent.click(screen.getByRole("button", { name: "アカウントを削除" }));
}

test("セッション確認中はローディングを表示する", () => {
  useSessionMock.mockReturnValue({ data: null, isPending: true });

  render(<SettingsPage />);

  expect(screen.getByText("セッション確認中…")).toBeInTheDocument();
});

test("未ログイン時はサインインへの導線を表示する", () => {
  useSessionMock.mockReturnValue({ data: null, isPending: false });

  render(<SettingsPage />);

  expect(screen.getByText("設定を利用するにはサインインが必要です。")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "サインインへ" })).toBeInTheDocument();
});

test("ログイン中は名前とメールアドレスを表示する", () => {
  useSessionMock.mockReturnValue(loggedIn);

  render(<SettingsPage />);

  expect(screen.getByText("テストユーザー")).toBeInTheDocument();
  expect(screen.getByText("me@example.com")).toBeInTheDocument();
});

test("パスワード未入力では削除ボタンが無効になる", () => {
  useSessionMock.mockReturnValue(loggedIn);

  render(<SettingsPage />);

  expect(screen.getByRole("button", { name: "アカウントを削除" })).toBeDisabled();
});

test("confirm でキャンセルすると deleteUser を呼ばない", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  confirmMock.mockReturnValue(false);

  render(<SettingsPage />);
  await submitDelete();

  expect(confirmMock).toHaveBeenCalled();
  expect(deleteUserMock).not.toHaveBeenCalled();
});

test("削除に成功するとホームへ遷移する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  deleteUserMock.mockResolvedValue({ error: null });

  render(<SettingsPage />);
  await submitDelete();

  expect(deleteUserMock).toHaveBeenCalledWith({ password: "password1234" });
  await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
});

test("削除に失敗するとエラーメッセージを表示し遷移しない", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  deleteUserMock.mockResolvedValue({ error: { message: "パスワードが正しくありません" } });

  render(<SettingsPage />);
  await submitDelete("wrong-password");

  await waitFor(() => expect(screen.getByText("パスワードが正しくありません")).toBeInTheDocument());
  expect(pushMock).not.toHaveBeenCalled();
  // 失敗後は再入力して再試行できる（ボタンが再度有効になる）。
  expect(screen.getByRole("button", { name: "アカウントを削除" })).toBeEnabled();
});

test("ネットワークエラー時もエラーメッセージを表示しボタンが再度有効になる", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  deleteUserMock.mockRejectedValue(new TypeError("Failed to fetch"));

  render(<SettingsPage />);
  await submitDelete();

  await waitFor(() =>
    expect(screen.getByText("アカウントの削除に失敗しました")).toBeInTheDocument(),
  );
  expect(pushMock).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "アカウントを削除" })).toBeEnabled();
});
