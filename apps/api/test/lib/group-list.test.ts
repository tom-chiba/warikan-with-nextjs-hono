import { describe, expect, it } from "vitest";
import { buildGroupList, type GroupListRow } from "../../src/lib/group-list";

const row = (id: string, lastViewedAt: Date | null = null): GroupListRow => ({
  id,
  name: `グループ${id}`,
  role: "member",
  lastViewedAt,
});

describe("buildGroupList", () => {
  it("空なら空一覧とカレント null", () => {
    expect(buildGroupList([])).toEqual({ groups: [], currentGroupId: null });
  });

  it("一覧から lastViewedAt を外し、入力順を保つ", () => {
    const { groups } = buildGroupList([row("g1"), row("g2")]);
    expect(groups).toEqual([
      { id: "g1", name: "グループg1", role: "member" },
      { id: "g2", name: "グループg2", role: "member" },
    ]);
  });

  it("last_viewed_at が最大の行がカレントになる", () => {
    const { currentGroupId } = buildGroupList([
      row("g1", new Date(1000)),
      row("g2", new Date(3000)),
      row("g3", new Date(2000)),
    ]);
    expect(currentGroupId).toBe("g2");
  });

  it("どの行にも記録がなければカレントは null", () => {
    const { currentGroupId } = buildGroupList([row("g1"), row("g2")]);
    expect(currentGroupId).toBeNull();
  });

  it("記録のある行と無い行が混在したら、記録のある行だけが対象になる", () => {
    const { currentGroupId } = buildGroupList([row("g1"), row("g2", new Date(1)), row("g3")]);
    expect(currentGroupId).toBe("g2");
  });

  it("同値タイは走査順で先の行が勝つ", () => {
    const { currentGroupId } = buildGroupList([
      row("g1", new Date(1000)),
      row("g2", new Date(1000)),
    ]);
    expect(currentGroupId).toBe("g1");
  });
});
