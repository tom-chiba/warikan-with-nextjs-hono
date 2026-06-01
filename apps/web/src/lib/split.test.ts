import { describe, expect, it } from "vitest";
import { distributeEqually } from "./split";

const sum = (record: Record<string, number>) => Object.values(record).reduce((a, b) => a + b, 0);

describe("distributeEqually", () => {
  it("割り切れる場合は全員に等しく配分する", () => {
    const result = distributeEqually(1000, ["a", "b"]);
    expect(result).toEqual({ a: 500, b: 500 });
  });

  it("端数は 1 円ずつ配られ、合計は total と一致する", () => {
    // 1000 / 3 = 333 余り 1。rng=0 固定なら先頭候補が +1。
    const result = distributeEqually(1000, ["a", "b", "c"], () => 0);
    expect(result).toEqual({ a: 334, b: 333, c: 333 });
    expect(sum(result)).toBe(1000);
  });

  it("端数 2 の場合は異なる 2 名に 1 円ずつ配られる", () => {
    // 1001 / 3 = 333 余り 2。rng=0 固定なら毎回 candidates の先頭が選ばれ、重複せず配られる。
    const result = distributeEqually(1001, ["a", "b", "c"], () => 0);
    expect(result).toEqual({ a: 334, b: 334, c: 333 });
    expect(sum(result)).toBe(1001);
  });

  it("rng がどんな値でも合計は常に total と一致する", () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const result = distributeEqually(9999, ["a", "b", "c", "d", "e", "f", "g"], () => r);
      expect(sum(result)).toBe(9999);
    }
  });

  it("total が 0 なら全員 0", () => {
    expect(distributeEqually(0, ["a", "b"])).toEqual({ a: 0, b: 0 });
  });

  it("メンバーが 0 人なら空オブジェクト", () => {
    expect(distributeEqually(1000, [])).toEqual({});
  });
});
