import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { renderWithClient } from "@/test/render-with-client";

const {
  useSessionMock,
  activeGetMock,
  postMock,
  deleteMock,
  membersGetMock,
  memberDeleteMock,
  displayNamePutMock,
  groupsGetMock,
  groupPatchMock,
  pushMock,
  clipboardMock,
  confirmMock,
} = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  activeGetMock: vi.fn(),
  postMock: vi.fn(),
  deleteMock: vi.fn(),
  membersGetMock: vi.fn(),
  memberDeleteMock: vi.fn(),
  displayNamePutMock: vi.fn(),
  groupsGetMock: vi.fn(),
  groupPatchMock: vi.fn(),
  pushMock: vi.fn(),
  clipboardMock: vi.fn(),
  confirmMock: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => useSessionMock(),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ groupId: "g1" }),
  useRouter: () => ({ push: pushMock }),
}));
vi.mock("@/lib/api-client", () => ({
  // use-groups が 401 時に参照する実体もモックに持たせる（欠けると 401 系テスト追加時に new undefined() で落ちる）。
  UnauthorizedError: class extends Error {},
  apiClient: {
    groups: {
      // 見出しのグループ名表示（useGroups）が使う一覧取得。
      $get: (...args: unknown[]) => groupsGetMock(...args),
      ":groupId": {
        // グループ名の変更（GroupNameEditor）。
        $patch: (...args: unknown[]) => groupPatchMock(...args),
        invitations: {
          active: { $get: (...args: unknown[]) => activeGetMock(...args) },
          $post: (...args: unknown[]) => postMock(...args),
          ":token": { $delete: (...args: unknown[]) => deleteMock(...args) },
        },
        members: {
          $get: (...args: unknown[]) => membersGetMock(...args),
          ":userId": { $delete: (...args: unknown[]) => memberDeleteMock(...args) },
          me: { "display-name": { $put: (...args: unknown[]) => displayNamePutMock(...args) } },
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
Object.defineProperty(window, "confirm", { value: confirmMock, configurable: true });

beforeEach(() => {
  // 破壊的操作の確認ダイアログは既定で承認扱いにする（キャンセル挙動は個別にテストする）。
  confirmMock.mockReturnValue(true);
  // 見出しのグループ名はログイン済みの全テストで取得が走るため、既定値はここで設定する
  //（setDefaults を使わず members/invitation を個別に設定するテストでも query が失敗しないように）。
  groupsGetMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      groups: [{ id: "g1", name: "京都旅行", role: "owner", lastViewedAt: null }],
      currentGroupId: "g1",
      currentGroupMembers: null,
    }),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const loggedIn = {
  data: { user: { id: "u1", name: "わたし", email: "me@example.com" } },
  isPending: false,
};
const futureIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const nowIso = new Date().toISOString();

// 招待リンク取得のデフォルト（無し）とメンバー一覧のデフォルト（自分のみ owner）。
function setDefaults() {
  activeGetMock.mockResolvedValue({ ok: true, json: async () => ({ invitation: null }) });
  membersGetMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      members: [
        {
          userId: "u1",
          name: "わたし",
          displayName: null,
          email: "me@example.com",
          role: "owner",
          joinedAt: nowIso,
        },
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
        {
          userId: "u1",
          name: "わたし",
          displayName: null,
          email: "me@example.com",
          role: "owner",
          joinedAt: nowIso,
        },
        {
          userId: "u2",
          name: "ともだち",
          displayName: null,
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

test("退出の確認をキャンセルすると削除 API は呼ばれない", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setDefaults();
  confirmMock.mockReturnValue(false);

  renderWithClient(<GroupPage />);

  await userEvent.click(await screen.findByRole("button", { name: "退出" }));

  expect(memberDeleteMock).not.toHaveBeenCalled();
  expect(pushMock).not.toHaveBeenCalled();
});

test("メンバー削除に失敗するとエラーメッセージを表示する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  activeGetMock.mockResolvedValue({ ok: true, json: async () => ({ invitation: null }) });
  membersGetMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      members: [
        {
          userId: "u1",
          name: "わたし",
          displayName: null,
          email: "me@example.com",
          role: "owner",
          joinedAt: nowIso,
        },
        {
          userId: "u2",
          name: "ともだち",
          displayName: null,
          email: "f@example.com",
          role: "member",
          joinedAt: nowIso,
        },
      ],
    }),
  });
  memberDeleteMock.mockResolvedValue({ ok: false, json: async () => ({}) });

  renderWithClient(<GroupPage />);

  await userEvent.click(await screen.findByRole("button", { name: "削除" }));

  expect(await screen.findByText("メンバーの削除に失敗しました")).toBeInTheDocument();
});

test("「表示名を変更」ボタンは自分の行にだけ表示される", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  activeGetMock.mockResolvedValue({ ok: true, json: async () => ({ invitation: null }) });
  membersGetMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      members: [
        {
          userId: "u1",
          name: "わたし",
          displayName: null,
          email: "me@example.com",
          role: "owner",
          joinedAt: nowIso,
        },
        {
          userId: "u2",
          name: "ともだち",
          displayName: null,
          email: "f@example.com",
          role: "member",
          joinedAt: nowIso,
        },
      ],
    }),
  });

  renderWithClient(<GroupPage />);

  expect(await screen.findByText("ともだち")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "表示名を変更" })).toHaveLength(1);
});

test("未設定なら入力欄は空でアカウント名がプレースホルダになり、保存で PUT が呼ばれ一覧を再取得する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setDefaults();
  displayNamePutMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });

  renderWithClient(<GroupPage />);

  await userEvent.click(await screen.findByRole("button", { name: "表示名を変更" }));

  const input = screen.getByRole("textbox", { name: "表示名" });
  expect(input).toHaveValue("");
  expect(input).toHaveAttribute("placeholder", "わたし");

  await userEvent.type(input, "お父さん");
  await userEvent.click(screen.getByRole("button", { name: "保存" }));

  await waitFor(() => {
    expect(displayNamePutMock).toHaveBeenCalledWith({
      param: { groupId: "g1" },
      json: { displayName: "お父さん" },
    });
    // invalidate により一覧を再取得する（初回 + 保存後）。
    expect(membersGetMock).toHaveBeenCalledTimes(2);
  });
  // 保存に成功したら編集フォームは閉じる。
  expect(screen.queryByRole("textbox", { name: "表示名" })).not.toBeInTheDocument();
});

test("設定済みの表示名は入力欄にプレフィルされ、前後の空白は取り除いて送信する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  activeGetMock.mockResolvedValue({ ok: true, json: async () => ({ invitation: null }) });
  membersGetMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      members: [
        {
          userId: "u1",
          name: "お父さん",
          displayName: "お父さん",
          email: "me@example.com",
          role: "owner",
          joinedAt: nowIso,
        },
      ],
    }),
  });
  displayNamePutMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });

  renderWithClient(<GroupPage />);

  await userEvent.click(await screen.findByRole("button", { name: "表示名を変更" }));

  const input = screen.getByRole("textbox", { name: "表示名" });
  expect(input).toHaveValue("お父さん");

  await userEvent.clear(input);
  await userEvent.type(input, "  パパ  ");
  await userEvent.click(screen.getByRole("button", { name: "保存" }));

  await waitFor(() => {
    expect(displayNamePutMock).toHaveBeenCalledWith({
      param: { groupId: "g1" },
      json: { displayName: "パパ" },
    });
  });
});

test("空白のみの入力では保存ボタンが無効で API は呼ばれない", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setDefaults();

  renderWithClient(<GroupPage />);

  await userEvent.click(await screen.findByRole("button", { name: "表示名を変更" }));

  const input = screen.getByRole("textbox", { name: "表示名" });
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();

  await userEvent.type(input, "   ");
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  expect(displayNamePutMock).not.toHaveBeenCalled();
});

test("キャンセルで編集フォームが閉じ、API は呼ばれない", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setDefaults();

  renderWithClient(<GroupPage />);

  await userEvent.click(await screen.findByRole("button", { name: "表示名を変更" }));
  await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));

  expect(screen.queryByRole("textbox", { name: "表示名" })).not.toBeInTheDocument();
  expect(displayNamePutMock).not.toHaveBeenCalled();
});

test("表示名の保存に失敗するとエラーメッセージを表示し、フォームは開いたまま残る", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setDefaults();
  displayNamePutMock.mockResolvedValue({ ok: false, json: async () => ({}) });

  renderWithClient(<GroupPage />);

  await userEvent.click(await screen.findByRole("button", { name: "表示名を変更" }));
  await userEvent.type(screen.getByRole("textbox", { name: "表示名" }), "お父さん");
  await userEvent.click(screen.getByRole("button", { name: "保存" }));

  expect(await screen.findByText("表示名の保存に失敗しました")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "表示名" })).toBeInTheDocument();
});

test("見出しにグループ名が表示され、owner には変更ボタンが出る", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setDefaults();

  renderWithClient(<GroupPage />);

  expect(await screen.findByRole("heading", { name: "京都旅行" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "変更" })).toBeEnabled();
});

test("グループ名の取得が完了するまで見出しはフォールバックし、変更ボタンは無効", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setDefaults();
  // 取得中のままにする（解決しない Promise）。
  groupsGetMock.mockReturnValue(new Promise(() => {}));

  renderWithClient(<GroupPage />);

  expect(await screen.findByRole("heading", { name: "グループ" })).toBeInTheDocument();
  // 変更ボタンは members の解決（owner 判定）後に現れるため、出現を待ってから無効を確かめる。
  expect(await screen.findByRole("button", { name: "変更" })).toBeDisabled();
});

test("member には変更ボタンが表示されない", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setDefaults();
  membersGetMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      members: [
        {
          userId: "u1",
          name: "わたし",
          displayName: null,
          email: "me@example.com",
          role: "member",
          joinedAt: nowIso,
        },
      ],
    }),
  });

  renderWithClient(<GroupPage />);

  expect(await screen.findByRole("heading", { name: "京都旅行" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "変更" })).not.toBeInTheDocument();
});

test("グループ名は現在名がプレフィルされ、保存で PATCH が呼ばれ一覧を再取得しフォームが閉じる", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setDefaults();
  groupPatchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });

  renderWithClient(<GroupPage />);

  await userEvent.click(await screen.findByRole("button", { name: "変更" }));

  // 編集中も h1 見出しは残る（ページの見出し構造を維持する）。
  expect(screen.getByRole("heading", { name: "京都旅行" })).toBeInTheDocument();

  const input = screen.getByRole("textbox", { name: "グループ名" });
  expect(input).toHaveValue("京都旅行");

  await userEvent.clear(input);
  await userEvent.type(input, "  東京旅行  ");
  await userEvent.click(screen.getByRole("button", { name: "保存" }));

  await waitFor(() => {
    // 前後の空白は取り除いて送信する。
    expect(groupPatchMock).toHaveBeenCalledWith({
      param: { groupId: "g1" },
      json: { name: "東京旅行" },
    });
    // invalidate により一覧を再取得する（初回 + 保存後）。
    expect(groupsGetMock).toHaveBeenCalledTimes(2);
  });
  // 保存に成功したら編集フォームは閉じる。
  expect(screen.queryByRole("textbox", { name: "グループ名" })).not.toBeInTheDocument();
});

test("空白のみの入力ではグループ名の保存ボタンが無効で API は呼ばれない", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setDefaults();

  renderWithClient(<GroupPage />);

  await userEvent.click(await screen.findByRole("button", { name: "変更" }));

  const input = screen.getByRole("textbox", { name: "グループ名" });
  await userEvent.clear(input);
  await userEvent.type(input, "   ");
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  expect(groupPatchMock).not.toHaveBeenCalled();
});

test("グループ名の編集はキャンセルで閉じ、API は呼ばれない", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setDefaults();

  renderWithClient(<GroupPage />);

  await userEvent.click(await screen.findByRole("button", { name: "変更" }));
  await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));

  expect(screen.queryByRole("textbox", { name: "グループ名" })).not.toBeInTheDocument();
  expect(groupPatchMock).not.toHaveBeenCalled();
});

test("グループ名の保存に失敗するとエラーメッセージを表示し、フォームは開いたまま残る", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setDefaults();
  groupPatchMock.mockResolvedValue({ ok: false, json: async () => ({}) });

  renderWithClient(<GroupPage />);

  await userEvent.click(await screen.findByRole("button", { name: "変更" }));
  await userEvent.click(screen.getByRole("button", { name: "保存" }));

  expect(await screen.findByText("グループ名の保存に失敗しました")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "グループ名" })).toBeInTheDocument();
});
