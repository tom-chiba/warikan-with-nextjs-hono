import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, test, vi } from "vitest";

const { lastViewedPutMock } = vi.hoisted(() => ({
  lastViewedPutMock: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({
  // use-groups が 401 時に参照する実体もモックに持たせる（欠けると 401 系テスト追加時に new undefined() で落ちる）。
  UnauthorizedError: class extends Error {},
  apiClient: {
    groups: {
      ":groupId": {
        "last-viewed": { $put: (...args: unknown[]) => lastViewedPutMock(...args) },
      },
    },
  },
}));

import { resolveCurrentGroup, setCurrentGroup } from "./current-group";

afterEach(() => {
  vi.clearAllMocks();
});

const groups = [
  { id: "g1", name: "旅行", role: "owner" as const },
  { id: "g2", name: "飲み会", role: "member" as const },
];

test("currentGroupId が一覧にあればそのグループを返す", () => {
  expect(resolveCurrentGroup(groups, "g2")).toEqual(groups[1]);
});

test("currentGroupId が null・一覧に無い（脱退済み等）場合は先頭へフォールバックする", () => {
  expect(resolveCurrentGroup(groups, null)).toEqual(groups[0]);
  expect(resolveCurrentGroup(groups, "gone")).toEqual(groups[0]);
});

test("所属が 0 件なら null を返す", () => {
  expect(resolveCurrentGroup([], "g1")).toBeNull();
});

test("setCurrentGroup はキャッシュの currentGroupId を即時更新し、サーバーへ記録する", () => {
  lastViewedPutMock.mockResolvedValue({ ok: true });
  const queryClient = new QueryClient();
  queryClient.setQueryData(["groups"], { groups, currentGroupId: "g1" });

  setCurrentGroup(queryClient, "g2");

  expect(queryClient.getQueryData(["groups"])).toEqual({ groups, currentGroupId: "g2" });
  expect(lastViewedPutMock).toHaveBeenCalledWith({ param: { groupId: "g2" } });
});

test("setCurrentGroup はキャッシュ未取得なら何も書き込まない（記録のみ行う）", () => {
  lastViewedPutMock.mockResolvedValue({ ok: true });
  const queryClient = new QueryClient();

  setCurrentGroup(queryClient, "g1");

  expect(queryClient.getQueryData(["groups"])).toBeUndefined();
  expect(lastViewedPutMock).toHaveBeenCalledWith({ param: { groupId: "g1" } });
});

test("setCurrentGroup はサーバー記録の失敗を握りつぶす", async () => {
  lastViewedPutMock.mockRejectedValue(new Error("network"));
  const queryClient = new QueryClient();
  queryClient.setQueryData(["groups"], { groups, currentGroupId: "g1" });

  expect(() => setCurrentGroup(queryClient, "g2")).not.toThrow();
  // 未処理 rejection を出さずに完了する。
  await Promise.resolve();
  expect(queryClient.getQueryData(["groups"])).toEqual({ groups, currentGroupId: "g2" });
});
