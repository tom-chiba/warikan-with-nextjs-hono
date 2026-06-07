import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { renderWithClient } from "@/test/render-with-client";

// auth-client と next/navigation をモックする。vi.hoisted で巻き上げ順の問題を回避する。
// changeEmail / changePassword の送信はコンポーネントテスト側で検証するため、
// ここではモックしない（ページテストはボタン表示の確認までしか行わない）。
const { useSessionMock, deleteUserMock, signOutMock, pushMock, confirmMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  deleteUserMock: vi.fn(),
  signOutMock: vi.fn(),
  pushMock: vi.fn(),
  confirmMock: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => useSessionMock(),
  signOut: (...args: unknown[]) => signOutMock(...args),
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

  renderWithClient(<SettingsPage />);

  expect(screen.getByText("セッション確認中…")).toBeInTheDocument();
});

test("未ログイン時はサインインへの導線を表示する", () => {
  useSessionMock.mockReturnValue({ data: null, isPending: false });

  renderWithClient(<SettingsPage />);

  expect(screen.getByText("設定を利用するにはサインインが必要です。")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "サインインへ" })).toBeInTheDocument();
});

test("ログイン中は名前とメールアドレスを表示する", () => {
  useSessionMock.mockReturnValue(loggedIn);

  renderWithClient(<SettingsPage />);

  expect(screen.getByText("テストユーザー")).toBeInTheDocument();
  expect(screen.getByText("me@example.com")).toBeInTheDocument();
});

// フォームの開閉・送信の詳細は email-change-form.test.tsx / password-change-form.test.tsx で
// 検証するため、ページでは変更フォームへの導線（変更ボタン）が出ていることだけ確認する。
test("メールアドレスとパスワードの変更ボタンを表示する", () => {
  useSessionMock.mockReturnValue(loggedIn);

  renderWithClient(<SettingsPage />);

  expect(screen.getByRole("button", { name: "メールアドレスを変更" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "パスワードを変更" })).toBeInTheDocument();
});

test("設定ハブとしてグループ管理とホームへの導線を表示する", () => {
  useSessionMock.mockReturnValue(loggedIn);

  renderWithClient(<SettingsPage />);

  expect(screen.getByRole("link", { name: "グループ管理へ" })).toHaveAttribute("href", "/groups");
  expect(screen.getByRole("link", { name: "ホームへ戻る" })).toHaveAttribute("href", "/");
});

test("サインアウトするとホームへ遷移する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  signOutMock.mockResolvedValue(undefined);

  renderWithClient(<SettingsPage />);
  await userEvent.click(screen.getByRole("button", { name: "サインアウト" }));

  expect(signOutMock).toHaveBeenCalled();
  await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
});

test("パスワード未入力では削除ボタンが無効になる", () => {
  useSessionMock.mockReturnValue(loggedIn);

  renderWithClient(<SettingsPage />);

  expect(screen.getByRole("button", { name: "アカウントを削除" })).toBeDisabled();
});

test("confirm でキャンセルすると deleteUser を呼ばない", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  confirmMock.mockReturnValue(false);

  renderWithClient(<SettingsPage />);
  await submitDelete();

  expect(confirmMock).toHaveBeenCalled();
  expect(deleteUserMock).not.toHaveBeenCalled();
});

test("削除に成功するとホームへ遷移する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  deleteUserMock.mockResolvedValue({ error: null });

  renderWithClient(<SettingsPage />);
  await submitDelete();

  expect(deleteUserMock).toHaveBeenCalledWith({ password: "password1234" });
  await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
});

test("誤パスワードでは日本語のエラーメッセージを表示し遷移しない", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  // Better Auth 本体のエラーは英語 message + code で返る（実レスポンスと同形）。
  deleteUserMock.mockResolvedValue({
    error: { code: "INVALID_PASSWORD", message: "Invalid password" },
  });

  renderWithClient(<SettingsPage />);
  await submitDelete("wrong-password");

  await waitFor(() => expect(screen.getByText("パスワードが正しくありません")).toBeInTheDocument());
  expect(pushMock).not.toHaveBeenCalled();
  // 失敗後は再入力して再試行できる（ボタンが再度有効になる）。
  expect(screen.getByRole("button", { name: "アカウントを削除" })).toBeEnabled();
});

test("code の無いエラーは message をそのまま表示する（自前フックの日本語 message）", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  deleteUserMock.mockResolvedValue({ error: { message: "パスワードを入力してください" } });

  renderWithClient(<SettingsPage />);
  await submitDelete();

  await waitFor(() => expect(screen.getByText("パスワードを入力してください")).toBeInTheDocument());
  expect(pushMock).not.toHaveBeenCalled();
});

test("ネットワークエラー時もエラーメッセージを表示しボタンが再度有効になる", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  deleteUserMock.mockRejectedValue(new TypeError("Failed to fetch"));

  renderWithClient(<SettingsPage />);
  await submitDelete();

  await waitFor(() =>
    expect(screen.getByText("アカウントの削除に失敗しました")).toBeInTheDocument(),
  );
  expect(pushMock).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "アカウントを削除" })).toBeEnabled();
});
