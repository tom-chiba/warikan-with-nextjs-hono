import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";

const { useSessionMock, getMock, acceptMock, pushMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  getMock: vi.fn(),
  acceptMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => useSessionMock(),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ token: "tok" }),
  useRouter: () => ({ push: pushMock }),
}));
vi.mock("@/app/auth-panel", () => ({
  AuthPanel: () => <div>認証パネル</div>,
}));
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    invitations: {
      ":token": {
        $get: (...args: unknown[]) => getMock(...args),
        accept: { $post: (...args: unknown[]) => acceptMock(...args) },
      },
    },
  },
}));

import InvitePage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const loggedIn = { data: { user: { id: "u1", email: "me@example.com" } }, isPending: false };

test("未ログイン時はサインインのための認証パネルを表示する", () => {
  useSessionMock.mockReturnValue({ data: null, isPending: false });

  renderWithClient(<InvitePage />);

  expect(screen.getByText("参加するにはサインインしてください。")).toBeInTheDocument();
  expect(screen.getByText("認証パネル")).toBeInTheDocument();
});

test("有効な招待で参加すると、そのグループ画面へ遷移する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  getMock.mockResolvedValue({
    ok: true,
    json: async () => ({ valid: true, groupId: "g1", groupName: "京都旅行", alreadyMember: false }),
  });
  acceptMock.mockResolvedValue({ ok: true, json: async () => ({ groupId: "g1" }) });

  renderWithClient(<InvitePage />);

  expect(await screen.findByText("京都旅行")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "参加する" }));

  await waitFor(() => {
    expect(acceptMock).toHaveBeenCalledWith({ param: { token: "tok" } });
    expect(pushMock).toHaveBeenCalledWith("/groups/g1");
  });
});

test("既にメンバーならグループへの導線を表示する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  getMock.mockResolvedValue({
    ok: true,
    json: async () => ({ valid: true, groupId: "g1", groupName: "京都旅行", alreadyMember: true }),
  });

  renderWithClient(<InvitePage />);

  const link = await screen.findByRole("link", { name: "グループへ" });
  expect(link).toHaveAttribute("href", "/groups/g1");
  expect(screen.queryByRole("button", { name: "参加する" })).not.toBeInTheDocument();
});

test("無効・期限切れの招待はエラー表示になる", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  getMock.mockResolvedValue({ ok: true, json: async () => ({ valid: false }) });

  renderWithClient(<InvitePage />);

  expect(
    await screen.findByText("この招待リンクは無効か、有効期限が切れています。"),
  ).toBeInTheDocument();
});

test("プレビュー取得に失敗したらエラーと再試行を表示する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  // 1 回目は失敗、再試行で成功させる。
  getMock.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ valid: true, groupId: "g1", groupName: "京都旅行", alreadyMember: false }),
  });

  renderWithClient(<InvitePage />);

  expect(await screen.findByText("招待の確認中にエラーが発生しました。")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "再試行" }));

  expect(await screen.findByText("京都旅行")).toBeInTheDocument();
});
