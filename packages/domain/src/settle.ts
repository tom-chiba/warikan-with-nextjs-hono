// 精算（送金額の自動計算）ロジック。Issue #21。
// 選択した未精算アイテム群について、メンバーごとの収支（支払額合計 − 割勘金額合計）を集計し、
// 「誰が誰にいくら払えばよいか」という送金リストを算出する。送金回数は貪欲法で抑える
//（厳密な最小化ではないが実用上十分。Issue #21 で方針確定済み）。
// 金額はすべて整数（円）。各アイテムで「支払額合計 = 割勘金額合計」が保証されているため、
// 収支の総和は必ず 0 になり、送金額の合計はプラス側・マイナス側で相殺される。

export type AmountEntry = { userId: string; amount: number };

// 収入モード（Issue: 収入分配機能）。expense は支出（割り勘）、income は収入（分配）。
// income では payments=受取額、shares=分担額（取り分）として役割が反転するため、
// 収支集計（computeBalances）では符号を反転して合算する。
// DB スキーマ（enum 定義）・API のバリデーション（zod）から共通で参照し、
// 取りうる値の集合を単一の場所に保つ。
export const ITEM_KINDS = ["expense", "income"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export type SettlementItem = {
  kind: ItemKind;
  payments: AmountEntry[];
  shares: AmountEntry[];
};

// 送金 1 件。from（払う人）→ to（受け取る人）に amount 円。
export type Transfer = { from: string; to: string; amount: number };

// 選択アイテム群からメンバーごとの収支を集計する。
// 正 = 払いすぎ（受け取る側）、負 = 払い足りない（払う側）、0 はちょうど。
// expense は payments=+、shares=−。income は受け取った人が分担額を配る側になるため符号が逆
// （payments=−、shares=+）。
export function computeBalances(items: SettlementItem[]): Record<string, number> {
  const balances: Record<string, number> = {};
  const add = (userId: string, delta: number) => {
    balances[userId] = (balances[userId] ?? 0) + delta;
  };
  for (const { kind, payments, shares } of items) {
    const sign = kind === "income" ? -1 : 1;
    for (const p of payments) {
      add(p.userId, sign * p.amount);
    }
    for (const s of shares) {
      add(s.userId, -sign * s.amount);
    }
  }
  return balances;
}

// 収支から送金リストを算出する。最大の債務者（払う人）と最大の債権者（受け取る人）を
// 突き合わせて相殺していく貪欲法。amount = 0 のメンバーは対象外。
// 同額のときは userId 順で安定させ、結果を決定的にする。
export function minimizeTransfers(balances: Record<string, number>): Transfer[] {
  const byAmountDesc = (a: { userId: string; amount: number }, b: typeof a) =>
    b.amount - a.amount || a.userId.localeCompare(b.userId);

  // 受け取る側（正）と払う側（負の絶対値）に分ける。
  const creditors = Object.entries(balances)
    .filter(([, amount]) => amount > 0)
    .map(([userId, amount]) => ({ userId, amount }))
    .sort(byAmountDesc);
  const debtors = Object.entries(balances)
    .filter(([, amount]) => amount < 0)
    .map(([userId, amount]) => ({ userId, amount: -amount }))
    .sort(byAmountDesc);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(debtor.amount, creditor.amount);
    transfers.push({ from: debtor.userId, to: creditor.userId, amount });
    debtor.amount -= amount;
    creditor.amount -= amount;
    // 残高が尽きた側を次に進める（両方 0 なら両方進む）。
    if (debtor.amount === 0) {
      i += 1;
    }
    if (creditor.amount === 0) {
      j += 1;
    }
  }
  return transfers;
}

// 選択アイテム群から送金リストを算出する（集計 + 送金回数最小化）。
export function computeSettlements(items: SettlementItem[]): Transfer[] {
  return minimizeTransfers(computeBalances(items));
}

// 2 つの送金リストの完全一致を判定する（精算確定時のサーバー側検証、ADR-0013）。
// computeSettlements() は入力順序に依存せず決定的（同額時は userId 順で安定）なため、
// 同じデータからは必ず同じ配列が得られ、順序込みの単純比較で検証できる。
// この比較器はその順序保証に依存している。minimizeTransfers のソート・タイブレークを
// 変更する場合は、本関数の比較戦略もあわせて見直すこと。
export function transfersEqual(a: Transfer[], b: Transfer[]): boolean {
  return (
    a.length === b.length &&
    a.every((t, i) => t.from === b[i].from && t.to === b[i].to && t.amount === b[i].amount)
  );
}
