import { describe, expect, it } from "vitest";
import { groupByItem, makeRows } from "../../src/lib/items";

// sumAmount / validateAmounts は packages/domain へ移管したため、そのテストは
// packages/domain/src/amounts.test.ts にある（ここでは lib/items 固有の関数のみ検証する）。

describe("groupByItem", () => {
  it("itemId をキーに金額行をまとめる", () => {
    const map = groupByItem([
      { itemId: "i1", userId: "u1", amount: 100 },
      { itemId: "i2", userId: "u1", amount: 300 },
      { itemId: "i1", userId: "u2", amount: 200 },
    ]);
    expect(map.get("i1")).toEqual([
      { userId: "u1", amount: 100 },
      { userId: "u2", amount: 200 },
    ]);
    expect(map.get("i2")).toEqual([{ userId: "u1", amount: 300 }]);
    expect(map.get("i3")).toBeUndefined();
  });

  it("余分なフィールドは結果に含めない", () => {
    const map = groupByItem([{ itemId: "i1", userId: "u1", amount: 100, extra: "x" }]);
    expect(map.get("i1")).toEqual([{ userId: "u1", amount: 100 }]);
  });
});

describe("makeRows", () => {
  it("itemId を付与した挿入用の行へ変換する", () => {
    expect(makeRows("i1", [{ userId: "u1", amount: 100 }])).toEqual([
      { itemId: "i1", userId: "u1", amount: 100 },
    ]);
    expect(makeRows("i1", [])).toEqual([]);
  });
});
