import { describe, expect, it } from "vitest";
import {
  groupByItem,
  makeRows,
  sumAmount,
  transfersEqual,
  validateAmounts,
} from "../../src/lib/items";

describe("sumAmount", () => {
  it("amount を合算する（空配列は 0）", () => {
    expect(sumAmount([{ amount: 100 }, { amount: 250 }])).toBe(350);
    expect(sumAmount([])).toBe(0);
  });
});

describe("validateAmounts", () => {
  const a = (userId: string, amount: number) => ({ userId, amount });

  it("支払額合計 = 割勘金額合計なら null（妥当）", () => {
    expect(validateAmounts([a("u1", 1000)], [a("u1", 500), a("u2", 500)])).toBeNull();
  });

  it("合計が一致しなければエラーメッセージ", () => {
    expect(validateAmounts([a("u1", 1000)], [a("u1", 900)])).toBe(
      "支払額合計と割勘金額合計が一致していません",
    );
  });

  it("合計 0 円はエラー（空の購入品は保存しない）", () => {
    expect(validateAmounts([], [])).toBe("支払額合計と割勘金額合計が一致していません");
  });

  it("payments 内の同一メンバー重複はエラー", () => {
    expect(validateAmounts([a("u1", 500), a("u1", 500)], [a("u2", 1000)])).toBe(
      "同一メンバーが重複しています",
    );
  });

  it("shares 内の同一メンバー重複はエラー", () => {
    expect(validateAmounts([a("u1", 1000)], [a("u2", 500), a("u2", 500)])).toBe(
      "同一メンバーが重複しています",
    );
  });
});

describe("transfersEqual", () => {
  const t = (from: string, to: string, amount: number) => ({ from, to, amount });

  it("同一内容・同一順序なら true（空同士も true）", () => {
    expect(transfersEqual([t("a", "b", 100)], [t("a", "b", 100)])).toBe(true);
    expect(transfersEqual([], [])).toBe(true);
  });

  it("金額・宛先・長さのいずれかが違えば false", () => {
    expect(transfersEqual([t("a", "b", 100)], [t("a", "b", 101)])).toBe(false);
    expect(transfersEqual([t("a", "b", 100)], [t("a", "c", 100)])).toBe(false);
    expect(transfersEqual([t("a", "b", 100)], [])).toBe(false);
  });

  it("順序が違えば false（computeSettlements の決定的順序を前提とした順序込み比較）", () => {
    const x = [t("a", "c", 100), t("b", "c", 50)];
    const y = [t("b", "c", 50), t("a", "c", 100)];
    expect(transfersEqual(x, y)).toBe(false);
  });
});

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
