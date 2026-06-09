import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({
  sendVerificationEmail: vi.fn(),
}));

import { sendVerificationEmail } from "@/lib/auth-client";
import { VerificationSentNotice } from "./verification-sent-notice";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("確認メール送信済みの案内を表示する（#69）", () => {
  render(<VerificationSentNotice email="taro@example.com" onBack={() => {}} />);

  expect(screen.getByText(/確認メールを送信しました/)).toBeInTheDocument();
});

test("再送ボタンで sendVerificationEmail を呼び、完了を表示する（#69）", async () => {
  const user = userEvent.setup();
  vi.mocked(sendVerificationEmail).mockResolvedValue({ error: null } as never);
  render(<VerificationSentNotice email="taro@example.com" onBack={() => {}} />);

  await user.click(screen.getByRole("button", { name: "確認メールを再送" }));

  expect(sendVerificationEmail).toHaveBeenCalledWith(
    expect.objectContaining({ email: "taro@example.com" }),
  );
  expect(screen.getByText(/確認メールを再送しました/)).toBeInTheDocument();
});

test("「サインインへ戻る」で onBack を呼ぶ（#69）", async () => {
  const user = userEvent.setup();
  const onBack = vi.fn();
  render(<VerificationSentNotice email="taro@example.com" onBack={onBack} />);

  await user.click(screen.getByRole("button", { name: "サインインへ戻る" }));

  expect(onBack).toHaveBeenCalled();
});
