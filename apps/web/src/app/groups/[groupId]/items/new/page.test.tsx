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

test("未ログイン時はサインインへの導線を表示する", () => {
  useSessionMock.mockReturnValue({ data: null, isPending: false });
  renderWithClient(<NewItemPage />);
  expect(screen.getByText("サインインへ")).toBeInTheDocument();
});

test("等分はデフォルト ON で、支払額を入力すると割勘金額へ等分入力される", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setTwoMembers();
  renderWithClient(<NewItemPage />);

  const myPayment = await screen.findByLabelText("わたし の支払額");
  expect(screen.getByRole("checkbox")).toBeChecked();
  // 等分はデフォルト ON のため、支払額 1000 を入力するだけで 2 人へ 500 ずつ等分される（端数なしで決定的）。
  await userEvent.type(myPayment, "1000");

  expect(await screen.findByLabelText("わたし の割勘金額")).toHaveValue(500);
  expect(screen.getByLabelText("ともだち の割勘金額")).toHaveValue(500);
});

test("等分 ON 中に支払額を変更すると割勘が再追従する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setTwoMembers();
  renderWithClient(<NewItemPage />);

  const myPayment = await screen.findByLabelText("わたし の支払額");
  await userEvent.type(myPayment, "1000"); // 等分はデフォルト ON → 500/500
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

  // 等分（デフォルト ON）を OFF にし、割勘を手入力で超過させる。
  const myPayment = await screen.findByLabelText("わたし の支払額");
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.type(myPayment, "500");
  await userEvent.type(screen.getByLabelText("わたし の割勘金額"), "900"); // 超過（deficit < 0）
  const fillButtons = screen.getAllByRole("button", { name: "残りをここに" });
  expect(fillButtons[0]).toBeDisabled();
});

test("等分を OFF にすると入力済みの割勘金額がクリアされる", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setTwoMembers();
  renderWithClient(<NewItemPage />);

  await userEvent.type(await screen.findByLabelText("わたし の支払額"), "1000"); // 等分（デフォルト ON）→ 500/500
  expect(await screen.findByLabelText("わたし の割勘金額")).toHaveValue(500);

  // 等分を OFF → 自動入力された割勘は破棄され、手入力をまっさらな状態から始められる。
  await userEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByLabelText("わたし の割勘金額")).toHaveValue(null);
  expect(screen.getByLabelText("ともだち の割勘金額")).toHaveValue(null);
});

test("等分 ON 中に割勘を手入力するとスイッチが OFF になる", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setTwoMembers();
  renderWithClient(<NewItemPage />);

  await userEvent.type(await screen.findByLabelText("わたし の支払額"), "1000");
  const toggle = screen.getByRole("checkbox");
  expect(toggle).toBeChecked(); // デフォルト ON

  // 割勘を手入力 → 等分の意思を撤回したとみなしスイッチ自動 OFF。
  await userEvent.type(screen.getByLabelText("ともだち の割勘金額"), "1");
  expect(toggle).not.toBeChecked();
});

test("「残りをここに」で不足分が対象メンバーへ加算される", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setTwoMembers();
  renderWithClient(<NewItemPage />);

  await userEvent.type(await screen.findByLabelText("購入品名"), "ランチ");
  // 等分（デフォルト ON）を OFF にしてから支払額を入力し、割勘未入力（合計 0）の状態を作る。
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.type(screen.getByLabelText("わたし の支払額"), "1000");
  // 不足 1000 をわたしの行に加算する。
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
  await userEvent.type(screen.getByLabelText("わたし の支払額"), "1000"); // 等分（デフォルト ON）→ 500/500

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

test("等分を OFF にして保存しても、リセット後は等分 ON に戻る", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setTwoMembers();
  itemsPostMock.mockResolvedValue({ ok: true, json: async () => ({ id: "item1" }) });
  renderWithClient(<NewItemPage />);

  await userEvent.type(await screen.findByLabelText("購入品名"), "ランチ");
  // 等分を OFF にして手動で割勘を入力する（全額わたし）。
  const toggle = screen.getByRole("checkbox");
  await userEvent.click(toggle);
  await userEvent.type(screen.getByLabelText("わたし の支払額"), "1000");
  await userEvent.type(screen.getByLabelText("わたし の割勘金額"), "1000");

  await userEvent.click(screen.getByRole("button", { name: "保存" }));

  // 連続入力のリセット後はデフォルトの等分 ON に戻る。
  expect(await screen.findByText("保存しました。続けて入力できます。")).toBeInTheDocument();
  expect(toggle).toBeChecked();
});

test("保存時に 401 が返るとセッション切れメッセージを表示する", async () => {
  useSessionMock.mockReturnValue(loggedIn);
  setTwoMembers();
  itemsPostMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
  renderWithClient(<NewItemPage />);

  await userEvent.type(await screen.findByLabelText("購入品名"), "ランチ");
  await userEvent.type(screen.getByLabelText("わたし の支払額"), "1000"); // 等分（デフォルト ON）→ 500/500

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
  // 等分（デフォルト ON）を OFF にして、合計が一致しない状態を手入力で作る。
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.type(screen.getByLabelText("わたし の支払額"), "1000");
  await userEvent.type(screen.getByLabelText("わたし の割勘金額"), "900");

  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
});
