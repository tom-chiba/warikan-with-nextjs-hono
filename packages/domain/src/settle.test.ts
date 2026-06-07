import { describe, expect, it } from "vitest";
import {
  computeBalances,
  computeSettlements,
  minimizeTransfers,
  type SettlementItem,
  type Transfer,
} from "./settle";

const sumTransfers = (transfers: Transfer[]) => transfers.reduce((acc, t) => acc + t.amount, 0);

describe("computeBalances", () => {
  it("支払額合計 − 割勘金額合計を集計する", () => {
    // a が 1000 立替、a/b で 500 ずつ負担 → a:+500, b:-500。
    const items: SettlementItem[] = [
      {
        payments: [{ userId: "a", amount: 1000 }],
        shares: [
          { userId: "a", amount: 500 },
          { userId: "b", amount: 500 },
        ],
      },
    ];
    expect(computeBalances(items)).toEqual({ a: 500, b: -500 });
  });

  it("複数アイテムをまたいで合算する", () => {
    const items: SettlementItem[] = [
      {
        payments: [{ userId: "a", amount: 1000 }],
        shares: [
          { userId: "a", amount: 500 },
          { userId: "b", amount: 500 },
        ],
      },
      {
        // b が 600 立替、a/b で 300 ずつ → b:+300, a:-300。
        payments: [{ userId: "b", amount: 600 }],
        shares: [
          { userId: "a", amount: 300 },
          { userId: "b", amount: 300 },
        ],
      },
    ];
    // a: +500-300=+200, b: -500+300=-200。
    expect(computeBalances(items)).toEqual({ a: 200, b: -200 });
  });

  it("収支の総和は常に 0", () => {
    const items: SettlementItem[] = [
      {
        payments: [
          { userId: "a", amount: 700 },
          { userId: "b", amount: 300 },
        ],
        shares: [
          { userId: "a", amount: 250 },
          { userId: "b", amount: 250 },
          { userId: "c", amount: 250 },
          { userId: "d", amount: 250 },
        ],
      },
    ];
    const balances = computeBalances(items);
    expect(Object.values(balances).reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("minimizeTransfers", () => {
  it("単純な 2 人の貸し借りを 1 件の送金にする", () => {
    expect(minimizeTransfers({ a: 500, b: -500 })).toEqual([{ from: "b", to: "a", amount: 500 }]);
  });

  it("収支 0 のメンバーは送金に含めない", () => {
    expect(minimizeTransfers({ a: 300, b: -300, c: 0 })).toEqual([
      { from: "b", to: "a", amount: 300 },
    ]);
  });

  it("債務者・債権者が複数でも相殺して送金リストを作る", () => {
    // a:+5, b:+1, c:-3, d:-3。
    const transfers = minimizeTransfers({ a: 5, b: 1, c: -3, d: -3 });
    // 送金の合計はプラス側合計（=6）と一致する。
    expect(sumTransfers(transfers)).toBe(6);
    // 各債務者の支払総額・各債権者の受取総額が収支と一致する。
    const paid: Record<string, number> = {};
    const received: Record<string, number> = {};
    for (const t of transfers) {
      paid[t.from] = (paid[t.from] ?? 0) + t.amount;
      received[t.to] = (received[t.to] ?? 0) + t.amount;
    }
    expect(paid).toEqual({ c: 3, d: 3 });
    expect(received).toEqual({ a: 5, b: 1 });
    // n-1 件以下に収まる（4 人なので 3 件以下）。
    expect(transfers.length).toBeLessThanOrEqual(3);
  });

  it("全員収支 0 なら送金なし", () => {
    expect(minimizeTransfers({ a: 0, b: 0 })).toEqual([]);
  });

  it("結果は決定的（同額のタイブレークは userId 順）", () => {
    const balances = { z: 100, a: 100, y: -100, b: -100 };
    expect(minimizeTransfers(balances)).toEqual(minimizeTransfers(balances));
  });
});

describe("computeSettlements", () => {
  it("選択アイテムから送金リストを算出し、送金合計が収支と整合する", () => {
    const items: SettlementItem[] = [
      {
        payments: [{ userId: "a", amount: 1200 }],
        shares: [
          { userId: "a", amount: 400 },
          { userId: "b", amount: 400 },
          { userId: "c", amount: 400 },
        ],
      },
    ];
    const transfers = computeSettlements(items);
    expect(sumTransfers(transfers)).toBe(800);
    expect(transfers).toEqual([
      { from: "b", to: "a", amount: 400 },
      { from: "c", to: "a", amount: 400 },
    ]);
  });
});
