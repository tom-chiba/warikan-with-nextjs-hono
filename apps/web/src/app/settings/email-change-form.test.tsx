import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

// auth-client をモックする。vi.hoisted で巻き上げ順の問題を回避する。
const { changeEmailMock } = vi.hoisted(() => ({
  changeEmailMock: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { changeEmail: changeEmailMock },
}));

import { EmailChangeForm } from "./email-change-form";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CURRENT_EMAIL = "me@example.com";

function renderForm() {
  render(<EmailChangeForm currentEmail={CURRENT_EMAIL} />);
}

async function openForm() {
  await userEvent.click(screen.getByRole("button", { name: "メールアドレスを変更" }));
}

// 新しいメールアドレスを入力して保存する共通操作。
async function submitNewEmail(newEmail = "new@example.com") {
  const input = screen.getByLabelText("新しいメールアドレス");
  await userEvent.clear(input);
  await userEvent.type(input, newEmail);
  await userEvent.click(screen.getByRole("button", { name: "保存" }));
}

test("現在のメールアドレスを表示し、フォームは閉じている", () => {
  renderForm();

  expect(screen.getByText(CURRENT_EMAIL)).toBeInTheDocument();
  expect(screen.queryByLabelText("新しいメールアドレス")).not.toBeInTheDocument();
});

test("変更ボタンを押すと現在のメールがプレフィルされたフォームが開く", async () => {
  renderForm();
  await openForm();

  expect(screen.getByLabelText("新しいメールアドレス")).toHaveValue(CURRENT_EMAIL);
});

test("現在のメールアドレスのままでは保存ボタンが無効になる", async () => {
  renderForm();
  await openForm();

  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
});

test("変更に成功するとフォームが閉じて成功メッセージが表示される", async () => {
  changeEmailMock.mockResolvedValue({ error: null });

  renderForm();
  await openForm();
  await submitNewEmail("new@example.com");

  expect(changeEmailMock).toHaveBeenCalledWith({ newEmail: "new@example.com" });
  await waitFor(() => expect(screen.getByText("メールアドレスを変更しました")).toBeInTheDocument());
  expect(screen.queryByLabelText("新しいメールアドレス")).not.toBeInTheDocument();
});

test("重複エラーは hooks.before の日本語 message をそのまま表示しフォームは閉じない", async () => {
  changeEmailMock.mockResolvedValue({
    error: { message: "このメールアドレスはすでに使用されています" },
  });

  renderForm();
  await openForm();
  await submitNewEmail("taken@example.com");

  await waitFor(() =>
    expect(screen.getByText("このメールアドレスはすでに使用されています")).toBeInTheDocument(),
  );
  // 失敗後は入力し直して再試行できる（フォームが開いたまま）。
  expect(screen.getByLabelText("新しいメールアドレス")).toBeInTheDocument();
});

test("message の無いエラーは日本語のフォールバックを表示する", async () => {
  changeEmailMock.mockResolvedValue({ error: {} });

  renderForm();
  await openForm();
  await submitNewEmail();

  await waitFor(() =>
    expect(screen.getByText("メールアドレスの変更に失敗しました")).toBeInTheDocument(),
  );
});

test("ネットワークエラー時もエラーメッセージを表示する", async () => {
  changeEmailMock.mockRejectedValue(new TypeError("Failed to fetch"));

  renderForm();
  await openForm();
  await submitNewEmail();

  await waitFor(() =>
    expect(screen.getByText("メールアドレスの変更に失敗しました")).toBeInTheDocument(),
  );
});

test("キャンセルするとフォームが閉じる", async () => {
  renderForm();
  await openForm();
  await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));

  expect(screen.queryByLabelText("新しいメールアドレス")).not.toBeInTheDocument();
  expect(changeEmailMock).not.toHaveBeenCalled();
});

test("再度開くと前回のエラーが消えて現在のメールから編集を始める", async () => {
  changeEmailMock.mockResolvedValue({
    error: { message: "このメールアドレスはすでに使用されています" },
  });

  renderForm();
  await openForm();
  await submitNewEmail("taken@example.com");
  await waitFor(() =>
    expect(screen.getByText("このメールアドレスはすでに使用されています")).toBeInTheDocument(),
  );
  await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));
  await openForm();

  expect(screen.queryByText("このメールアドレスはすでに使用されています")).not.toBeInTheDocument();
  expect(screen.getByLabelText("新しいメールアドレス")).toHaveValue(CURRENT_EMAIL);
});
