import type { AmountEntry } from "@warikan/domain";
import { inArray } from "drizzle-orm";
import type { DbVariables } from "../context";
import { itemPayment, itemShare } from "../db/schema";
import { groupByItem } from "./items";

// 指定アイテム群の payments / shares を読み、itemId をキーにまとめて返す。
// GET /items（一覧への埋め込み）と POST /settlements（送金リスト再計算の入力、ADR-0013）で
// 共通利用する。「一覧が表示したもの」と「精算時にサーバーが検証するもの」を同じ読み込みに
// 揃えることで、二つの実装が別々に変更されて検証の前提が崩れることを構造的に防ぐ。
// 2 つの SELECT は独立なので db.batch で 1 往復にまとめる（往復削減。バッチの原子性は不要だが無害）。
export async function loadItemAmounts(db: DbVariables["db"], ids: string[]) {
  if (ids.length === 0) {
    return {
      paymentsByItem: new Map<string, AmountEntry[]>(),
      sharesByItem: new Map<string, AmountEntry[]>(),
    };
  }
  const [payments, shares] = await db.batch([
    db.select().from(itemPayment).where(inArray(itemPayment.itemId, ids)),
    db.select().from(itemShare).where(inArray(itemShare.itemId, ids)),
  ]);
  return { paymentsByItem: groupByItem(payments), sharesByItem: groupByItem(shares) };
}
