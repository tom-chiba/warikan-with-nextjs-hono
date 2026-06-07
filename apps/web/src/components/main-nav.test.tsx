import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { renderWithClient } from "@/test/render-with-client";

const { pushMock, setCurrentGroupMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  setCurrentGroupMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));
// カレントグループの記録・キャッシュ更新は current-group.test.ts が担うため、呼び出しのみ検証する。
vi.mock("@/lib/current-group", () => ({
  setCurrentGroup: (...args: unknown[]) => setCurrentGroupMock(...args),
}));

import { MainNav } from "./main-nav";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const oneGroup = [{ id: "g1", name: "旅行", role: "owner" as const }];
const twoGroups = [
  { id: "g1", name: "旅行", role: "owner" as const },
  { id: "g2", name: "飲み会", role: "member" as const },
];

test("3 タブと設定リンクを表示し、一覧タブは選択中グループの URL を指す", () => {
  renderWithClient(<MainNav groups={oneGroup} selectedGroupId="g1" activeTab="entry" />);

  expect(screen.getByRole("link", { name: "入力" })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: "未精算" })).toHaveAttribute("href", "/groups/g1/items");
  expect(screen.getByRole("link", { name: "精算済" })).toHaveAttribute(
    "href",
    "/groups/g1/items?status=settled",
  );
  expect(screen.getByRole("link", { name: "設定" })).toHaveAttribute("href", "/settings");
});

test("グループが 1 件のときはセレクタではなくグループ名を表示する", () => {
  renderWithClient(<MainNav groups={oneGroup} selectedGroupId="g1" activeTab="entry" />);

  expect(screen.getByText("旅行")).toBeInTheDocument();
  expect(screen.queryByLabelText("グループを切替")).not.toBeInTheDocument();
});

test("グループが 0 件のときは一覧タブを不活性にする", () => {
  renderWithClient(<MainNav groups={[]} selectedGroupId={null} activeTab="entry" />);

  expect(screen.getByText("グループなし")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "未精算" })).not.toBeInTheDocument();
  expect(screen.getByText("未精算")).toHaveAttribute("aria-disabled", "true");
});

test("一覧の取得中は「グループなし」と断定せずプレースホルダを出す", () => {
  renderWithClient(<MainNav groups={[]} selectedGroupId={null} activeTab="entry" loading />);

  expect(screen.getByText("…")).toBeInTheDocument();
  expect(screen.queryByText("グループなし")).not.toBeInTheDocument();
});

test("名前が引けない選択中グループ（取得失敗時等）もプレースホルダを出す", () => {
  renderWithClient(<MainNav groups={[]} selectedGroupId="g1" activeTab="unsettled" />);

  expect(screen.getByText("…")).toBeInTheDocument();
  expect(screen.queryByText("グループなし")).not.toBeInTheDocument();
  // タブは URL 由来の selectedGroupId で常に活性。
  expect(screen.getByRole("link", { name: "未精算" })).toHaveAttribute("href", "/groups/g1/items");
});

test("セレクタで切り替えるとカレントグループを記録する（入力タブでは遷移しない）", async () => {
  renderWithClient(<MainNav groups={twoGroups} selectedGroupId="g1" activeTab="entry" />);

  await userEvent.selectOptions(screen.getByLabelText("グループを切替"), "g2");

  expect(setCurrentGroupMock).toHaveBeenCalledWith(expect.anything(), "g2");
  expect(pushMock).not.toHaveBeenCalled();
});

test("未精算タブで切り替えると切替先グループの未精算一覧へ遷移する", async () => {
  renderWithClient(<MainNav groups={twoGroups} selectedGroupId="g1" activeTab="unsettled" />);

  await userEvent.selectOptions(screen.getByLabelText("グループを切替"), "g2");

  expect(setCurrentGroupMock).toHaveBeenCalledWith(expect.anything(), "g2");
  expect(pushMock).toHaveBeenCalledWith("/groups/g2/items");
});

test("精算済タブで切り替えると切替先グループの精算済一覧へ遷移する", async () => {
  renderWithClient(<MainNav groups={twoGroups} selectedGroupId="g1" activeTab="settled" />);

  await userEvent.selectOptions(screen.getByLabelText("グループを切替"), "g2");

  expect(pushMock).toHaveBeenCalledWith("/groups/g2/items?status=settled");
});

test("アクティブタブが下線で示される", () => {
  renderWithClient(<MainNav groups={oneGroup} selectedGroupId="g1" activeTab="unsettled" />);

  expect(screen.getByRole("link", { name: "未精算" }).className).toContain("border-ink");
  expect(screen.getByRole("link", { name: "入力" }).className).not.toContain("border-ink");
});
