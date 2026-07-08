import { expect, test } from "vitest";
import {
  groupKeys,
  invitationKeys,
  invitationPreviewKeys,
  itemKeys,
  itemsOnDateKeys,
  memberKeys,
} from "./query-keys";

// 各ファクトリが返す配列の形を固定する。タイポ等での意図しない変更（無効化漏れ・無効化過多）を
// コンパイルエラーではなく実行時に検知できるようにするための最小限のピン留め。
test("query keys are pinned to their expected shape", () => {
  expect(groupKeys.all()).toEqual(["groups"]);
  expect(memberKeys.byGroup("g1")).toEqual(["members", "g1"]);
  expect(itemKeys.byGroup("g1")).toEqual(["items", "g1"]);
  expect(itemKeys.list("g1", "unsettled")).toEqual(["items", "g1", "unsettled"]);
  expect(itemKeys.list("g1", "settled")).toEqual(["items", "g1", "settled"]);
  expect(itemKeys.detail("g1", "i1")).toEqual(["item", "g1", "i1"]);
  expect(itemsOnDateKeys.byGroup("g1")).toEqual(["items-on-date", "g1"]);
  expect(itemsOnDateKeys.detail("g1", "2026-07-08")).toEqual(["items-on-date", "g1", "2026-07-08"]);
  expect(invitationKeys.active("g1")).toEqual(["invitation", "g1"]);
  expect(invitationPreviewKeys.detail("t1")).toEqual(["invitation-preview", "t1"]);
});

// itemKeys.byGroup は未精算/精算済の両方を前方一致で無効化するために使う。
// list が返す完全一致キーがこの前方一致に含まれることを固定し、取り違えを検知する。
test("itemKeys.byGroup is a prefix of itemKeys.list", () => {
  const byGroup = itemKeys.byGroup("g1");
  expect(itemKeys.list("g1", "unsettled")).toEqual([...byGroup, "unsettled"]);
  expect(itemKeys.list("g1", "settled")).toEqual([...byGroup, "settled"]);
});

// itemsOnDateKeys.byGroup は日付別の detail キーを前方一致で無効化するために使う。
test("itemsOnDateKeys.byGroup is a prefix of itemsOnDateKeys.detail", () => {
  const byGroup = itemsOnDateKeys.byGroup("g1");
  expect(itemsOnDateKeys.detail("g1", "2026-07-08")).toEqual([...byGroup, "2026-07-08"]);
});
