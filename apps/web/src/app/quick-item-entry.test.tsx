import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { todayLocal } from "@/lib/date";
import { renderWithClient } from "@/test/render-with-client";

// フォームの入力・検証の詳細は item-form / new/page のテストが担う。
// ここでは「指定したグループのメンバー取得・保存・導線」が自己完結で動くことを検証する。
const { membersGetMock, itemsPostMock } = vi.hoisted(() => ({
  membersGetMock: vi.fn(),
  itemsPostMock: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  // use-groups が 401 時に参照する実体もモックに持たせる（欠けると 401 系テスト追加時に new undefined() で落ちる）。
  UnauthorizedError: class extends Error {},
  apiClient: {
    groups: {
      ":groupId": {
        members: { $get: (...args: unknown[]) => membersGetMock(...args) },
        items: { $post: (...args: unknown[]) => itemsPostMock(...args) },
      },
    },
  },
}));

import { QuickItemEntry } from "./quick-item-entry";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const nowIso = new Date().toISOString();

// メンバー 2 名（わたし / ともだち）を返すデフォルト。
function setTwoMembers() {
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
}

test("グループ名の見出しと入力フォームを表示する", async () => {
  setTwoMembers();
  renderWithClient(<QuickItemEntry groupId="g1" groupName="旅行" />);

  expect(screen.getByRole("heading", { name: "旅行 に購入品を入力" })).toBeInTheDocument();
  expect(await screen.findByLabelText("わたし の支払額")).toBeInTheDocument();
  expect(membersGetMock).toHaveBeenCalledWith({ param: { groupId: "g1" } });
});

test("保存すると指定グループへ POST し、成功メッセージを表示する", async () => {
  setTwoMembers();
  itemsPostMock.mockResolvedValue({ ok: true, json: async () => ({ id: "item1" }) });
  renderWithClient(<QuickItemEntry groupId="g1" groupName="旅行" />);

  await userEvent.type(await screen.findByLabelText("購入品名"), "ランチ");
  await userEvent.type(screen.getByLabelText("わたし の支払額"), "1000"); // 等分（デフォルト ON）→ 500/500

  await userEvent.click(screen.getByRole("button", { name: "保存" }));

  await waitFor(() => {
    expect(itemsPostMock).toHaveBeenCalledWith({
      param: { groupId: "g1" },
      json: {
        name: "ランチ",
        purchasedOn: todayLocal(),
        memo: null,
        payments: [{ userId: "u1", amount: 1000 }],
        shares: [
          { userId: "u1", amount: 500 },
          { userId: "u2", amount: 500 },
        ],
      },
    });
  });
  expect(await screen.findByText("保存しました。続けて入力できます。")).toBeInTheDocument();
});

test("メンバー一覧の取得に失敗したらエラーを表示し、フォームは出さない", async () => {
  membersGetMock.mockResolvedValue({ ok: false, json: async () => ({}) });
  renderWithClient(<QuickItemEntry groupId="g1" groupName="旅行" />);

  expect(await screen.findByText("メンバー一覧の取得に失敗しました。")).toBeInTheDocument();
  expect(screen.queryByLabelText("購入品名")).not.toBeInTheDocument();
});

test("保存時に 401 が返るとセッション切れメッセージを表示する", async () => {
  setTwoMembers();
  itemsPostMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
  renderWithClient(<QuickItemEntry groupId="g1" groupName="旅行" />);

  await userEvent.type(await screen.findByLabelText("購入品名"), "ランチ");
  await userEvent.type(screen.getByLabelText("わたし の支払額"), "1000"); // 等分（デフォルト ON）→ 500/500

  await userEvent.click(screen.getByRole("button", { name: "保存" }));

  expect(
    await screen.findByText("セッションが切れました。再度サインインしてください。"),
  ).toBeInTheDocument();
});
