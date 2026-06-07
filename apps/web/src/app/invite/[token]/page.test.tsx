import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { renderWithClient } from "@/test/render-with-client";

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
// セッション状態表示の文言は session-states.test.tsx が担うため、ここでは配置だけを検証する。
vi.mock("@/components/session-states", () => ({
  SessionPending: () => <div>セッション確認中画面</div>,
}));
vi.mock("@/lib/api-client", () => ({
  // use-groups が 401 時に参照する実体もモックに持たせる（欠けると 401 系テスト追加時に new undefined() で落ちる）。
  UnauthorizedError: class extends Error {},
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

const loggedIn = { data: { user: { id: "u1", email: "me@example.com" } }, isPending: false };

test("セッション確認中はローディング表示を出す", () => {
  useSessionMock.mockReturnValue({ data: null, isPending: true });

  renderWithClient(<InvitePage />);

  expect(screen.getByText("セッション確認中画面")).toBeInTheDocument();
});

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
