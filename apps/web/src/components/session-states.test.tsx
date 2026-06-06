import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { SessionError, SessionPending, SignInPrompt } from "./session-states";

// 各テスト後にレンダリング結果を破棄し、モックの呼び出し履歴もクリアする。
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// 文言・導線の検証はこのファイルに集約する。各ページのテストはスタブ差し替えで配置のみを検証する。

test("SessionPending はセッション確認中の文言を表示する", () => {
  render(<SessionPending />);

  expect(screen.getByText("セッション確認中…")).toBeInTheDocument();
});

test("SessionError はエラー文言を表示し、再試行で onRetry を呼ぶ", async () => {
  const onRetry = vi.fn();

  render(<SessionError onRetry={onRetry} />);

  expect(screen.getByText("セッションの確認に失敗しました。")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "再試行" }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test("SignInPrompt は既定の文言とトップページへの導線を表示する", () => {
  render(<SignInPrompt />);

  expect(screen.getByText("このページを利用するにはサインインが必要です。")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "サインインへ" })).toHaveAttribute("href", "/");
});

test("SignInPrompt は message で文言を差し替えられる", () => {
  render(<SignInPrompt message="設定を利用するにはサインインが必要です。" />);

  expect(screen.getByText("設定を利用するにはサインインが必要です。")).toBeInTheDocument();
});
