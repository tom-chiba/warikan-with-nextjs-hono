import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";

const { useSessionMock, activeGetMock, postMock, deleteMock, clipboardMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  activeGetMock: vi.fn(),
  postMock: vi.fn(),
  deleteMock: vi.fn(),
  clipboardMock: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => useSessionMock(),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ groupId: "g1" }),
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

const loggedIn = { data: { user: { email: "me@example.com" } }, isPending: false };
const futureIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

test("未ログイン時はサインインへの導線を表示する", () => {
  useSessionMock.mockReturnValue({ data: null, isPending: false });

  renderWithClient(<GroupPage />);

  expect(screen.getByText("サインインへ")).toBeInTheDocument();
});

test("有効な招待リンクがあれば URL を表示し、コピーできる", async () => {
  useSessionMock.mockReturnValue(loggedIn);
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
  // 初回は null、発行後の再取得で有効リンクを返す。
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

  const generateButton = await screen.findByRole("button", { name: "招待リンクを発行" });
  await userEvent.click(generateButton);

  await waitFor(() => {
    expect(postMock).toHaveBeenCalledWith({ param: { groupId: "g1" } });
  });
  expect(await screen.findByText(/\/invite\/newtok$/)).toBeInTheDocument();
});
