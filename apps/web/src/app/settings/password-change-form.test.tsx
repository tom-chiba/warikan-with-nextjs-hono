import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

// auth-client をモックする。vi.hoisted で巻き上げ順の問題を回避する。
const { changePasswordMock } = vi.hoisted(() => ({
  changePasswordMock: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { changePassword: changePasswordMock },
}));

import { PasswordChangeForm } from "./password-change-form";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function openForm() {
  await userEvent.click(screen.getByRole("button", { name: "パスワードを変更" }));
}

// 現在・新パスワードを入力して保存する共通操作。
async function submitChange(currentPassword = "password1234", newPassword = "new-password1234") {
  await userEvent.type(screen.getByLabelText("現在のパスワード"), currentPassword);
  await userEvent.type(screen.getByLabelText("新しいパスワード"), newPassword);
  await userEvent.click(screen.getByRole("button", { name: "保存" }));
}

test("初期表示ではフォームが閉じている", () => {
  render(<PasswordChangeForm />);

  expect(screen.queryByLabelText("現在のパスワード")).not.toBeInTheDocument();
});

test("変更ボタンを押すとフォームが開く", async () => {
  render(<PasswordChangeForm />);
  await openForm();

  expect(screen.getByLabelText("現在のパスワード")).toBeInTheDocument();
  expect(screen.getByLabelText("新しいパスワード")).toBeInTheDocument();
});

test("現在のパスワードと 8 文字以上の新パスワードが揃うまで保存ボタンが無効になる", async () => {
  render(<PasswordChangeForm />);
  await openForm();

  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  await userEvent.type(screen.getByLabelText("現在のパスワード"), "password1234");
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  // 7 文字（最小長未満）ではまだ無効のまま。
  await userEvent.type(screen.getByLabelText("新しいパスワード"), "short77");
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  // 8 文字に達すると有効になる。
  await userEvent.type(screen.getByLabelText("新しいパスワード"), "8");
  expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
});

test("変更に成功するとフォームが閉じて成功メッセージが表示される", async () => {
  changePasswordMock.mockResolvedValue({ error: null });

  render(<PasswordChangeForm />);
  await openForm();
  await submitChange();

  // 他端末のセッション失効（revokeOtherSessions）込みで呼ばれること。
  expect(changePasswordMock).toHaveBeenCalledWith({
    currentPassword: "password1234",
    newPassword: "new-password1234",
    revokeOtherSessions: true,
  });
  await waitFor(() => expect(screen.getByText("パスワードを変更しました")).toBeInTheDocument());
  expect(screen.queryByLabelText("現在のパスワード")).not.toBeInTheDocument();
});

test("現在のパスワードが誤っていると日本語のエラーを表示しフォームは閉じない", async () => {
  changePasswordMock.mockResolvedValue({
    error: { code: "INVALID_PASSWORD", message: "Invalid password" },
  });

  render(<PasswordChangeForm />);
  await openForm();
  await submitChange("wrong-password");

  await waitFor(() =>
    expect(screen.getByText("現在のパスワードが正しくありません")).toBeInTheDocument(),
  );
  // 失敗後は入力し直して再試行できる（フォームが開いたまま）。
  expect(screen.getByLabelText("現在のパスワード")).toBeInTheDocument();
});

// 8 文字未満はボタン無効化で送信前に防いでいるが、サーバー側の最小長設定が
// 引き上げられた場合に備えて PASSWORD_TOO_SHORT のマップは維持している。
test("新しいパスワードが短すぎると日本語のエラーを表示する", async () => {
  changePasswordMock.mockResolvedValue({
    error: { code: "PASSWORD_TOO_SHORT", message: "Password too short" },
  });

  render(<PasswordChangeForm />);
  await openForm();
  await submitChange();

  await waitFor(() =>
    expect(screen.getByText("新しいパスワードは8文字以上で入力してください")).toBeInTheDocument(),
  );
});

test("新しいパスワードが長すぎると日本語のエラーを表示する", async () => {
  changePasswordMock.mockResolvedValue({
    error: { code: "PASSWORD_TOO_LONG", message: "Password too long" },
  });

  render(<PasswordChangeForm />);
  await openForm();
  await submitChange();

  await waitFor(() =>
    expect(screen.getByText("新しいパスワードは128文字以内で入力してください")).toBeInTheDocument(),
  );
});

test("code の無いエラーは message をそのまま表示する", async () => {
  changePasswordMock.mockResolvedValue({ error: { message: "パスワードを入力してください" } });

  render(<PasswordChangeForm />);
  await openForm();
  await submitChange();

  await waitFor(() => expect(screen.getByText("パスワードを入力してください")).toBeInTheDocument());
});

test("ネットワークエラー時もエラーメッセージを表示する", async () => {
  changePasswordMock.mockRejectedValue(new TypeError("Failed to fetch"));

  render(<PasswordChangeForm />);
  await openForm();
  await submitChange();

  await waitFor(() =>
    expect(screen.getByText("パスワードの変更に失敗しました")).toBeInTheDocument(),
  );
});

test("キャンセルするとフォームが閉じる", async () => {
  render(<PasswordChangeForm />);
  await openForm();
  await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));

  expect(screen.queryByLabelText("現在のパスワード")).not.toBeInTheDocument();
  expect(changePasswordMock).not.toHaveBeenCalled();
});

test("再度開くと前回の入力とエラーが消える", async () => {
  changePasswordMock.mockResolvedValue({
    error: { code: "INVALID_PASSWORD", message: "Invalid password" },
  });

  render(<PasswordChangeForm />);
  await openForm();
  await submitChange("wrong-password");
  await waitFor(() =>
    expect(screen.getByText("現在のパスワードが正しくありません")).toBeInTheDocument(),
  );
  await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));
  await openForm();

  expect(screen.queryByText("現在のパスワードが正しくありません")).not.toBeInTheDocument();
  expect(screen.getByLabelText("現在のパスワード")).toHaveValue("");
  expect(screen.getByLabelText("新しいパスワード")).toHaveValue("");
});
