import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";

const {
  useSessionMock,
  activeGetMock,
  postMock,
  deleteMock,
  membersGetMock,
  memberDeleteMock,
  pushMock,
  clipboardMock,
} = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  activeGetMock: vi.fn(),
  postMock: vi.fn(),
  deleteMock: vi.fn(),
  membersGetMock: vi.fn(),
  memberDeleteMock: vi.fn(),
  pushMock: vi.fn(),
  clipboardMock: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => useSessionMock(),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ groupId: "g1" }),
  useRouter: () => ({ push: pushMock }),
}));
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    groups: {
      ":groupId": {
        invitations: {
          active: { $get: (...args: unknown[]) => activeGetMock(...args) },
          $post: (...args: unknown[]) => postMock(...args),
          ":token": { $delete: (...args: unknown[]) => deleteMock(...args) },
        },
        members: {
          $get: (...args: unknown[]) => membersGetMock(...args),
          ":userId": { $delete: (...args: unknown[]) => memberDeleteMock(...args) },
        },
      },
    },
  },
}));

import GroupPage from "./page";

Object.defineProperty(navigator, "clipboard", {
  value: { writeText: clipboardMock },
  configurable: true,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const loggedIn = { data: { user: { id: "u1", email: "me@example.com" } }, isPending: false };
const futureIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const nowIso = new Date().toISOString();

// 招待リンク取得のデフォルト（無し）とメンバー一覧のデフォルト（自分のみ owner）。
function setDefaults() {
  activeGetMock.mockResolvedValue({ ok: true, json: async () => ({ invitation: null }) });
  membersGetMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      members: [
        { userId: "u1", name: "わたし", email: "me@example.com", role: "owner", joinedAt: nowIso },
      ],
    }),
  });
}

test("未ログイン時はサインインへの導線を表示する", () => {
  useSessionMock.mockReturnValue({ data: null, isPending: false });

  renderWithClient(<GroupPage />);

  expect(screen.getByText("サインインへ")).toBeInTheDocument();
});

test("有効な招待リンクがあれば URL を表示し、コピーできる", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setDefaults();
  activeGetMock.mockResolvedValue({
    ok: true,
    json: async () => ({ invitation: { token: "abc", expiresAt: futureIso } }),
  });

  renderWithClient(<GroupPage />);

  const code = await screen.findByText(/\/invite\/abc$/);
  expect(code).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "コピー" }));
  await waitFor(() => {
    expect(clipboardMock).toHaveBeenCalledWith(expect.stringMatching(/\/invite\/abc$/));
  });
});

test("招待が無いときは発行ボタンを表示し、発行すると URL が表示される", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setDefaults();
  activeGetMock
    .mockResolvedValueOnce({ ok: true, json: async () => ({ invitation: null }) })
    .mockResolvedValue({
      ok: true,
      json: async () => ({ invitation: { token: "newtok", expiresAt: futureIso } }),
    });
  postMock.mockResolvedValue({
    ok: true,
    json: async () => ({ token: "newtok", expiresAt: futureIso }),
  });

  renderWithClient(<GroupPage />);

  await userEvent.click(await screen.findByRole("button", { name: "招待リンクを発行" }));

  await waitFor(() => {
    expect(postMock).toHaveBeenCalledWith({ param: { groupId: "g1" } });
  });
  expect(await screen.findByText(/\/invite\/newtok$/)).toBeInTheDocument();
});

test("owner は他メンバーを削除でき、自分には退出ボタンが出る", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  activeGetMock.mockResolvedValue({ ok: true, json: async () => ({ invitation: null }) });
  membersGetMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      members: [
        { userId: "u1", name: "わたし", email: "me@example.com", role: "owner", joinedAt: nowIso },
        {
          userId: "u2",
          name: "ともだち",
          email: "f@example.com",
          role: "member",
          joinedAt: nowIso,
        },
      ],
    }),
  });
  memberDeleteMock.mockResolvedValue({
    ok: true,
    json: async () => ({ removed: true, groupDeleted: false }),
  });

  renderWithClient(<GroupPage />);

  expect(await screen.findByText("ともだち")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "退出" })).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "削除" }));
  await waitFor(() => {
    expect(memberDeleteMock).toHaveBeenCalledWith({ param: { groupId: "g1", userId: "u2" } });
  });
});

test("自分が退出するとグループ一覧へ遷移する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setDefaults();
  memberDeleteMock.mockResolvedValue({
    ok: true,
    json: async () => ({ removed: true, groupDeleted: true }),
  });

  renderWithClient(<GroupPage />);

  await userEvent.click(await screen.findByRole("button", { name: "退出" }));

  await waitFor(() => {
    expect(memberDeleteMock).toHaveBeenCalledWith({ param: { groupId: "g1", userId: "u1" } });
    expect(pushMock).toHaveBeenCalledWith("/groups");
  });
});
