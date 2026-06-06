import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { renderWithClient } from "@/test/render-with-client";

const { useSessionMock, membersGetMock, itemsPostMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  membersGetMock: vi.fn(),
  itemsPostMock: vi.fn(),
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
        members: { $get: (...args: unknown[]) => membersGetMock(...args) },
        items: { $post: (...args: unknown[]) => itemsPostMock(...args) },
      },
    },
  },
}));

import NewItemPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const loggedIn = { data: { user: { id: "u1", email: "me@example.com" } }, isPending: false };
const nowIso = new Date().toISOString();

// メンバー 2 名（わたし / ともだち）を返すデフォルト。
function setTwoMembers() {
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
}

test("未ログイン時はサインインへの導線を表示する", () => {
  useSessionMock.mockReturnValue({ data: null, isPending: false });
  renderWithClient(<NewItemPage />);
  expect(screen.getByText("サインインへ")).toBeInTheDocument();
});

test("等分スイッチ ON で支払額合計が割勘金額へ等分入力される", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setTwoMembers();
  renderWithClient(<NewItemPage />);

  const myPayment = await screen.findByLabelText("わたし の支払額");
  await userEvent.type(myPayment, "1000");
  // 支払額入力後に等分 ON にすると、1000 を 2 人で 500 ずつ等分する（端数なしで決定的）。
  await userEvent.click(screen.getByRole("checkbox"));

  expect(await screen.findByLabelText("わたし の割勘金額")).toHaveValue(500);
  expect(screen.getByLabelText("ともだち の割勘金額")).toHaveValue(500);
});

test("等分 ON 中に支払額を変更すると割勘が再追従する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setTwoMembers();
  renderWithClient(<NewItemPage />);

  const myPayment = await screen.findByLabelText("わたし の支払額");
  await userEvent.type(myPayment, "1000");
  await userEvent.click(screen.getByRole("checkbox")); // 500/500
  expect(await screen.findByLabelText("わたし の割勘金額")).toHaveValue(500);

  // 等分 ON のまま支払額を 2000 へ変更 → 1000/1000 に追従する（effect ではなくイベントで再計算）。
  await userEvent.clear(myPayment);
  await userEvent.type(myPayment, "2000");
  expect(screen.getByLabelText("わたし の割勘金額")).toHaveValue(1000);
  expect(screen.getByLabelText("ともだち の割勘金額")).toHaveValue(1000);
});

test("割勘が支払額を超過しているとき「残りをここに」は無効", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setTwoMembers();
  renderWithClient(<NewItemPage />);

  await userEvent.type(await screen.findByLabelText("わたし の支払額"), "500");
  await userEvent.type(screen.getByLabelText("わたし の割勘金額"), "900"); // 超過（deficit < 0）
  const fillButtons = screen.getAllByRole("button", { name: "残りをここに" });
  expect(fillButtons[0]).toBeDisabled();
});

test("等分 ON 中に割勘を手入力するとスイッチが OFF になる", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setTwoMembers();
  renderWithClient(<NewItemPage />);

  await userEvent.type(await screen.findByLabelText("わたし の支払額"), "1000");
  const toggle = screen.getByRole("checkbox");
  await userEvent.click(toggle);
  expect(toggle).toBeChecked();

  // 割勘を手入力 → 等分の意思を撤回したとみなしスイッチ自動 OFF。
  await userEvent.type(screen.getByLabelText("ともだち の割勘金額"), "1");
  expect(toggle).not.toBeChecked();
});

test("「残りをここに」で不足分が対象メンバーへ加算される", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setTwoMembers();
  renderWithClient(<NewItemPage />);

  await userEvent.type(await screen.findByLabelText("購入品名"), "ランチ");
  await userEvent.type(screen.getByLabelText("わたし の支払額"), "1000");
  // 割勘は未入力（合計 0）。不足 1000 をわたしの行に加算する。
  const fillButtons = screen.getAllByRole("button", { name: "残りをここに" });
  await userEvent.click(fillButtons[0]);

  expect(screen.getByLabelText("わたし の割勘金額")).toHaveValue(1000);
  // 合計一致したので保存ボタンが有効になる。
  expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
});

test("保存すると 0 円行を除いて POST し、成功後にフォームがリセットされる", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setTwoMembers();
  itemsPostMock.mockResolvedValue({ ok: true, json: async () => ({ id: "item1" }) });
  renderWithClient(<NewItemPage />);

  const nameInput = await screen.findByLabelText("購入品名");
  await userEvent.type(nameInput, "ランチ");
  await userEvent.type(screen.getByLabelText("わたし の支払額"), "1000");
  await userEvent.click(screen.getByRole("checkbox")); // 等分 → 500/500

  await userEvent.click(screen.getByRole("button", { name: "保存" }));

  await waitFor(() => {
    expect(itemsPostMock).toHaveBeenCalledWith({
      param: { groupId: "g1" },
      json: {
        name: "ランチ",
        purchasedOn: null,
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
  expect(screen.getByLabelText("購入品名")).toHaveValue("");
});

test("保存時に 401 が返るとセッション切れメッセージを表示する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setTwoMembers();
  itemsPostMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
  renderWithClient(<NewItemPage />);

  await userEvent.type(await screen.findByLabelText("購入品名"), "ランチ");
  await userEvent.type(screen.getByLabelText("わたし の支払額"), "1000");
  await userEvent.click(screen.getByRole("checkbox")); // 等分 → 500/500

  await userEvent.click(screen.getByRole("button", { name: "保存" }));

  expect(
    await screen.findByText("セッションが切れました。再度サインインしてください。"),
  ).toBeInTheDocument();
});

test("合計が一致しないと保存ボタンは無効", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setTwoMembers();
  renderWithClient(<NewItemPage />);

  await userEvent.type(await screen.findByLabelText("購入品名"), "不一致");
  await userEvent.type(screen.getByLabelText("わたし の支払額"), "1000");
  await userEvent.type(screen.getByLabelText("わたし の割勘金額"), "900");

  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
});
