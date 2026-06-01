// 等分割勘の計算ロジック。
// total を userIds の人数で等分し、割り切れない端数（1 円単位）は乱数でメンバーへ振り分ける。
// 戻り値は { [userId]: amount } で、各 amount の合計は必ず total と一致する。
//
// rng は [0, 1) の乱数を返す関数。テストで決定的に差し替えられるよう引数化し、既定は Math.random。
// 「振り分け結果は確定時に固定し再描画で変えない」要件は、呼び出し側がこの結果を state に保持し、
// 支払額の変更時など必要なタイミングでのみ再計算することで満たす（毎レンダリングでは呼ばない）。
export function distributeEqually(
  total: number,
  userIds: string[],
  rng: () => number = Math.random,
): Record<string, number> {
  const result: Record<string, number> = {};
  const count = userIds.length;
  if (count === 0) {
    return result;
  }

  // 全員に等しく行き渡る基礎額。端数は base に乗らない余り（0 以上 count 未満）。
  const base = Math.floor(total / count);
  let remainder = total - base * count;
  for (const userId of userIds) {
    result[userId] = base;
  }

  // 端数を 1 円ずつ、重複しないメンバーへランダムに配る。remainder < count なので必ず配り切れる。
  const candidates = [...userIds];
  while (remainder > 0 && candidates.length > 0) {
    const index = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length));
    const [picked] = candidates.splice(index, 1);
    result[picked] += 1;
    remainder -= 1;
  }

  return result;
}
