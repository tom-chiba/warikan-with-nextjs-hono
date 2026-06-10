import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { renderWithClient } from "@/test/render-with-client";

// auth-client をモックする。vi.hoisted で巻き上げ順の問題を回避する。
const { changeEmailMock } = vi.hoisted(() => ({
  changeEmailMock: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { changeEmail: changeEmailMock },
  verifyEmailCallbackURL: () => "http://localhost:3000/verify-email",
}));

import { EmailChangeForm } from "./email-change-form";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CURRENT_EMAIL = "me@example.com";

// EmailChangeForm は settings ページ配下で QueryClient コンテキスト内に置かれるため、
// テストでも同じコンテキストで描画する。
function renderForm() {
  renderWithClient(<EmailChangeForm currentEmail={CURRENT_EMAIL} />);
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

test("変更を要求するとフォームが閉じて確認メール送信の案内が表示される（#69）", async () => {
  changeEmailMock.mockResolvedValue({ error: null });

  renderForm();
  await openForm();
  await submitNewEmail("new@example.com");

  // #69 で検証済みユーザーの変更は新アドレス宛の確認リンク方式になり、callbackURL を渡す。
  expect(changeEmailMock).toHaveBeenCalledWith(
    expect.objectContaining({ newEmail: "new@example.com" }),
  );
  await waitFor(() => expect(screen.getByText(/確認メールを送信しました/)).toBeInTheDocument());
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
