import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

// auth-client と next/navigation をモックする。vi.hoisted で巻き上げ順の問題を回避する。
// searchParams はテストごとに差し替えるため、可変参照を hoisted で持つ。
const { resetPasswordMock, pushMock, params } = vi.hoisted(() => ({
  resetPasswordMock: vi.fn(),
  pushMock: vi.fn(),
  params: { value: new URLSearchParams() },
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { resetPassword: resetPasswordMock },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => params.value,
}));

import ResetPasswordPage from "./page";

beforeEach(() => {
  params.value = new URLSearchParams("token=valid-token");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function submit(newPassword = "new-password1234") {
  await userEvent.type(screen.getByLabelText("新しいパスワード"), newPassword);
  await userEvent.click(screen.getByRole("button", { name: "パスワードを再設定" }));
}

test("token があれば新パスワード入力フォームを表示する", () => {
  render(<ResetPasswordPage />);

  expect(screen.getByLabelText("新しいパスワード")).toBeInTheDocument();
});

test("token が無いときは無効リンクとして再申請へ誘導する", () => {
  params.value = new URLSearchParams();

  render(<ResetPasswordPage />);

  expect(screen.getByText(/このリンクは無効か期限切れです/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "パスワード再設定をやり直す" })).toHaveAttribute(
    "href",
    "/forgot-password",
  );
  expect(screen.queryByLabelText("新しいパスワード")).not.toBeInTheDocument();
});

test("error=INVALID_TOKEN のときも無効リンクとして扱う", () => {
  params.value = new URLSearchParams("error=INVALID_TOKEN");

  render(<ResetPasswordPage />);

  expect(screen.getByText(/このリンクは無効か期限切れです/)).toBeInTheDocument();
  expect(screen.queryByLabelText("新しいパスワード")).not.toBeInTheDocument();
});

test("8 文字未満のうちは再設定ボタンが無効になる", async () => {
  render(<ResetPasswordPage />);

  expect(screen.getByRole("button", { name: "パスワードを再設定" })).toBeDisabled();
  await userEvent.type(screen.getByLabelText("新しいパスワード"), "short77");
  expect(screen.getByRole("button", { name: "パスワードを再設定" })).toBeDisabled();
  await userEvent.type(screen.getByLabelText("新しいパスワード"), "8");
  expect(screen.getByRole("button", { name: "パスワードを再設定" })).toBeEnabled();
});

test("再設定に成功すると完了表示になり、サインインへ誘導する", async () => {
  resetPasswordMock.mockResolvedValue({ error: null });

  render(<ResetPasswordPage />);
  await submit();

  expect(resetPasswordMock).toHaveBeenCalledWith({
    newPassword: "new-password1234",
    token: "valid-token",
  });
  await waitFor(() => expect(screen.getByText(/パスワードを再設定しました/)).toBeInTheDocument());

  await userEvent.click(screen.getByRole("button", { name: "サインインへ" }));
  expect(pushMock).toHaveBeenCalledWith("/");
});

test("無効トークンのエラーは日本語で表示し、フォームは残る", async () => {
  resetPasswordMock.mockResolvedValue({
    error: { code: "INVALID_TOKEN", message: "invalid token" },
  });

  render(<ResetPasswordPage />);
  await submit();

  await waitFor(() => expect(screen.getByText(/リンクが無効か期限切れです/)).toBeInTheDocument());
  expect(screen.getByLabelText("新しいパスワード")).toBeInTheDocument();
});

test("短すぎる・長すぎるパスワードのエラーを日本語にマップする", async () => {
  resetPasswordMock.mockResolvedValue({
    error: { code: "PASSWORD_TOO_SHORT", message: "too short" },
  });

  render(<ResetPasswordPage />);
  await submit();

  await waitFor(() =>
    expect(screen.getByText("パスワードは8文字以上で入力してください")).toBeInTheDocument(),
  );
});

test("ネットワークエラー時もエラーメッセージを表示する", async () => {
  resetPasswordMock.mockRejectedValue(new TypeError("Failed to fetch"));

  render(<ResetPasswordPage />);
  await submit();

  await waitFor(() =>
    expect(screen.getByText("パスワードの再設定に失敗しました")).toBeInTheDocument(),
  );
});
