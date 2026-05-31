import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

// 各テスト後にレンダリング結果を破棄し、モックの呼び出し履歴もクリアする。
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// 依存モジュールをモックする。vi.hoisted で巻き上げ順の問題を回避する。
const { useSessionMock, postMock, pushMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  postMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => useSessionMock(),
}));
vi.mock("@/lib/api-client", () => ({
  apiClient: { groups: { $post: (...args: unknown[]) => postMock(...args) } },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import GroupsPage from "./page";

test("未ログイン時はサインインへの導線を表示する", () => {
  useSessionMock.mockReturnValue({ data: null, isPending: false });

  render(<GroupsPage />);

  expect(screen.getByText("サインインへ")).toBeInTheDocument();
});

test("グループ名を入力して作成すると、作成したグループ画面へ遷移する", async () => {
  useSessionMock.mockReturnValue({
    data: { user: { email: "me@example.com" } },
    isPending: false,
  });
  postMock.mockResolvedValue({
    ok: true,
    json: async () => ({ id: "group-123", name: "京都旅行" }),
  });

  render(<GroupsPage />);

  await userEvent.type(screen.getByLabelText("グループ名"), "京都旅行");
  await userEvent.click(screen.getByRole("button", { name: "作成" }));

  await waitFor(() => {
    expect(postMock).toHaveBeenCalledWith({ json: { name: "京都旅行" } });
    expect(pushMock).toHaveBeenCalledWith("/groups/group-123");
  });
});

test("作成に失敗するとエラーメッセージを表示する", async () => {
  useSessionMock.mockReturnValue({
    data: { user: { email: "me@example.com" } },
    isPending: false,
  });
  postMock.mockResolvedValue({ ok: false, json: async () => ({}) });

  render(<GroupsPage />);

  await userEvent.type(screen.getByLabelText("グループ名"), "失敗するグループ");
  await userEvent.click(screen.getByRole("button", { name: "作成" }));

  await waitFor(() => {
    expect(screen.getByText("グループの作成に失敗しました")).toBeInTheDocument();
  });
  expect(pushMock).not.toHaveBeenCalled();
});
