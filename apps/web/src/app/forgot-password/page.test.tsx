import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

// auth-client をモックする。vi.hoisted で巻き上げ順の問題を回避する。
const { requestPasswordResetMock } = vi.hoisted(() => ({
  requestPasswordResetMock: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { requestPasswordReset: requestPasswordResetMock },
}));

import ForgotPasswordPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function submit(email = "user@example.com") {
  await userEvent.type(screen.getByLabelText("メールアドレス"), email);
  await userEvent.click(screen.getByRole("button", { name: "再設定リンクを送信" }));
}

test("メール未入力のうちは送信ボタンが無効になる", () => {
  render(<ForgotPasswordPage />);

  expect(screen.getByRole("button", { name: "再設定リンクを送信" })).toBeDisabled();
});

test("送信に成功すると中立メッセージを表示し、redirectTo 付きで要求する", async () => {
  requestPasswordResetMock.mockResolvedValue({ error: null });

  render(<ForgotPasswordPage />);
  await submit("user@example.com");

  expect(requestPasswordResetMock).toHaveBeenCalledWith({
    email: "user@example.com",
    redirectTo: `${window.location.origin}/reset-password`,
  });
  // 登録の有無を判別させない中立表現であること。
  await waitFor(() =>
    expect(
      screen.getByText(/登録されている場合、パスワード再設定用のリンクを送信しました/),
    ).toBeInTheDocument(),
  );
  // 成功後は入力フォームを閉じる。
  expect(screen.queryByLabelText("メールアドレス")).not.toBeInTheDocument();
});

test("サーバーエラー時はエラーメッセージを表示しフォームは残る", async () => {
  requestPasswordResetMock.mockResolvedValue({
    error: { message: "送信に失敗しました。時間をおいて再度お試しください。" },
  });

  render(<ForgotPasswordPage />);
  await submit();

  await waitFor(() =>
    expect(
      screen.getByText("送信に失敗しました。時間をおいて再度お試しください。"),
    ).toBeInTheDocument(),
  );
  expect(screen.getByLabelText("メールアドレス")).toBeInTheDocument();
});

test("ネットワークエラー時もエラーメッセージを表示する", async () => {
  requestPasswordResetMock.mockRejectedValue(new TypeError("Failed to fetch"));

  render(<ForgotPasswordPage />);
  await submit();

  await waitFor(() =>
    expect(
      screen.getByText("送信に失敗しました。時間をおいて再度お試しください。"),
    ).toBeInTheDocument(),
  );
});
