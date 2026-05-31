import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";

// 依存モジュールをモックする。vi.hoisted で巻き上げ順の問題を回避する。
const { useSessionMock, postMock, getMock, pushMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  postMock: vi.fn(),
  getMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => useSessionMock(),
}));
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    groups: {
      $post: (...args: unknown[]) => postMock(...args),
      $get: (...args: unknown[]) => getMock(...args),
    },
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import GroupsPage from "./page";

// 各テスト後にレンダリング結果を破棄し、モックの呼び出し履歴もクリアする。
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// useQuery / useQueryClient を使うため QueryClientProvider で包む。
function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const loggedIn = { data: { user: { email: "me@example.com" } }, isPending: false };

test("未ログイン時はサインインへの導線を表示する", () => {
  useSessionMock.mockReturnValue({ data: null, isPending: false });

  renderWithClient(<GroupsPage />);

  expect(screen.getByText("サインインへ")).toBeInTheDocument();
});

test("所属グループが一覧表示され、各グループへのリンクを持つ", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  getMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      groups: [
        { id: "g1", name: "旅行", role: "owner" },
        { id: "g2", name: "飲み会", role: "member" },
      ],
    }),
  });

  renderWithClient(<GroupsPage />);

  const link = await screen.findByRole("link", { name: /旅行/ });
  expect(link).toHaveAttribute("href", "/groups/g1");
  expect(screen.getByRole("link", { name: /飲み会/ })).toHaveAttribute("href", "/groups/g2");
});

test("所属が 0 件のときは作成を促す表示になる", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  getMock.mockResolvedValue({ ok: true, json: async () => ({ groups: [] }) });

  renderWithClient(<GroupsPage />);

  expect(
    await screen.findByText("まだグループがありません。下のフォームから作成しましょう。"),
  ).toBeInTheDocument();
});

test("グループ名を入力して作成すると、作成したグループ画面へ遷移する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  getMock.mockResolvedValue({ ok: true, json: async () => ({ groups: [] }) });
  postMock.mockResolvedValue({
    ok: true,
    json: async () => ({ id: "group-123", name: "京都旅行" }),
  });

  renderWithClient(<GroupsPage />);

  await userEvent.type(screen.getByLabelText("グループ名"), "京都旅行");
  await userEvent.click(screen.getByRole("button", { name: "作成" }));

  await waitFor(() => {
    expect(postMock).toHaveBeenCalledWith({ json: { name: "京都旅行" } });
    expect(pushMock).toHaveBeenCalledWith("/groups/group-123");
  });
});

test("作成に失敗するとエラーメッセージを表示する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  getMock.mockResolvedValue({ ok: true, json: async () => ({ groups: [] }) });
  postMock.mockResolvedValue({ ok: false, json: async () => ({}) });

  renderWithClient(<GroupsPage />);

  await userEvent.type(screen.getByLabelText("グループ名"), "失敗するグループ");
  await userEvent.click(screen.getByRole("button", { name: "作成" }));

  await waitFor(() => {
    expect(screen.getByText("グループの作成に失敗しました")).toBeInTheDocument();
  });
  expect(pushMock).not.toHaveBeenCalled();
});
