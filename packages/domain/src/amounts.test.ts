import { describe, expect, it } from "vitest";
import { amountsBalanced, sumAmount, validateAmounts } from "./amounts";

describe("sumAmount", () => {
  it("amount を合算する（空配列は 0）", () => {
    expect(sumAmount([{ amount: 100 }, { amount: 250 }])).toBe(350);
    expect(sumAmount([])).toBe(0);
  });
});

describe("amountsBalanced", () => {
  it("支払額合計 > 0 かつ 割勘金額合計と一致すれば true", () => {
    expect(amountsBalanced(1000, 1000)).toBe(true);
  });

  it("合計が 0 なら false（空の購入品は保存しない）", () => {
    expect(amountsBalanced(0, 0)).toBe(false);
  });

  it("支払額合計と割勘金額合計が一致しなければ false", () => {
    expect(amountsBalanced(1000, 900)).toBe(false);
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
