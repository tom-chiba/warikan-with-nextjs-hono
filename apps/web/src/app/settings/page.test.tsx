import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { renderWithClient } from "@/test/render-with-client";

// auth-client と next/navigation をモックする。vi.hoisted で巻き上げ順の問題を回避する。
// changeEmail / changePassword の送信はコンポーネントテスト側で検証するため、
// ここではモックしない（ページテストはボタン表示の確認までしか行わない）。
const { useSessionMock, deleteUserMock, signOutMock, pushMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  deleteUserMock: vi.fn(),
  signOutMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => useSessionMock(),
  signOut: (...args: unknown[]) => signOutMock(...args),
  // #78: 削除は確認メールのリンク方式。callbackURL に着地先を渡して送信する。
  deleteAccountCallbackURL: () => "http://localhost:3000/account-deleted",
  authClient: { deleteUser: deleteUserMock },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import SettingsPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const loggedIn = {
  data: { user: { name: "テストユーザー", email: "me@example.com" } },
  isPending: false,
};

// 「アカウント削除の確認メールを送る」を押す共通操作（#78）。
async function requestDelete() {
  await userEvent.click(screen.getByRole("button", { name: "アカウント削除の確認メールを送る" }));
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

test("確認メールの送信に成功すると案内を表示し、callbackURL 付きで deleteUser を呼ぶ", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  deleteUserMock.mockResolvedValue({ error: null });

  renderWithClient(<SettingsPage />);
  await requestDelete();

  expect(deleteUserMock).toHaveBeenCalledWith({
    callbackURL: "http://localhost:3000/account-deleted",
  });
  await waitFor(() => expect(screen.getByText(/確認メールを送信しました/)).toBeInTheDocument());
  // 送信後は即削除されない（リンク踏破で確定）ため、ホームへの遷移は起こさない。
  expect(pushMock).not.toHaveBeenCalled();
});

test("送信に失敗するとエラーメッセージを表示しボタンが再度有効になる", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  deleteUserMock.mockResolvedValue({ error: { message: "送信できませんでした" } });

  renderWithClient(<SettingsPage />);
  await requestDelete();

  await waitFor(() => expect(screen.getByText("送信できませんでした")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "アカウント削除の確認メールを送る" })).toBeEnabled();
});

test("ネットワークエラー時もエラーメッセージを表示しボタンが再度有効になる", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  deleteUserMock.mockRejectedValue(new TypeError("Failed to fetch"));

  renderWithClient(<SettingsPage />);
  await requestDelete();

  await waitFor(() =>
    expect(screen.getByText("確認メールの送信に失敗しました")).toBeInTheDocument(),
  );
  expect(screen.getByRole("button", { name: "アカウント削除の確認メールを送る" })).toBeEnabled();
});
