import { zValidator } from "@hono/zod-validator";
import { computeSettlements, transfersEqual } from "@warikan/domain";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { DbVariables, GroupMemberVariables } from "../context";
import { groupMember, item, itemPayment, itemShare } from "../db/schema";
import { loadItemAmounts } from "../lib/item-amounts";
import { makeRows, sumAmount, validateAmounts } from "../lib/items";

// メンバーごとの金額入力（支払額・割勘金額の各行）。amount は正の整数（円）。
// 0 円（支払い／負担なし）の行はそもそも送らない仕様のため positive で弾く。
const amountEntry = z.object({
  userId: z.string().min(1),
  amount: z.number().int().positive(),
});

// 購入品の保存・更新の入力。purchasedOn は input type="date" の値（"YYYY-MM-DD"）。
// 購入日・メモは任意（未入力なら null 相当）。新規(POST)・更新(PUT)で共通。
const itemSchema = z.object({
  name: z.string().trim().min(1).max(100),
  purchasedOn: z.iso.date().nullish(),
  memo: z.string().max(500).nullish(),
  payments: z.array(amountEntry),
  shares: z.array(amountEntry),
});

// 精算実行時にクライアントが確認した送金リスト。共有ロジック computeSettlements() の出力と
// 同じ形（from → to へ amount 円）。サーバー側の再計算と突き合わせて検証する（ADR-0013）。
const transferEntry = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  amount: z.number().int().positive(),
});

// 当該グループの全メンバー userId 集合を返す（payments/shares の userId 検証用）。
async function groupMemberIds(
  db: (GroupMemberVariables & DbVariables)["db"],
  groupId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ userId: groupMember.userId })
    .from(groupMember)
    .where(eq(groupMember.groupId, groupId));
  return new Set(rows.map((m) => m.userId));
}

// /groups/:groupId 配下の保護ルート（当該グループのメンバー限定）。
// 認可ミドルウェア（requireAuth / provideDb / requireGroupMember）は index.ts 側でマウントするため、
// ここでは Bindings(Env) を持たず Variables だけ型付けする。これにより rpc.ts の AppType に
// Workers 固有型が混入せず、フロントエンドが型解決できる状態を保てる（ADR-0009 / ADR-0010）。
export const items = new Hono<{
  Variables: GroupMemberVariables & DbVariables;
}>()
  // 購入品を保存する。
  .post("/:groupId/items", zValidator("json", itemSchema), async (c) => {
    const member = c.get("groupMember");
    const db = c.get("db");
    const { name, purchasedOn, memo, payments, shares } = c.req.valid("json");

    const amountError = validateAmounts(payments, shares);
    if (amountError) {
      return c.json({ error: amountError }, 400);
    }

    // payments / shares の全 userId が当該グループのメンバーであることを検証する
    //（他グループや非メンバーの userId 混入を防ぐ）。
    const memberIds = await groupMemberIds(db, member.groupId);
    const allUserIds = [...payments, ...shares].map((e) => e.userId);
    if (allUserIds.some((id) => !memberIds.has(id))) {
      return c.json({ error: "グループに属さないメンバーが含まれています" }, 400);
    }

    // item + item_payment + item_share を db.batch()（D1 の暗黙の SQL トランザクション = all-or-nothing）で
    // 原子的に作成する。id は JS 側で確定させ子テーブルと共有する。status は既定の "unsettled"（未精算）。
    // D1 は対話的トランザクション（db.transaction()）非対応のため batch を用いる（groups-collection と同方針）。
    // 合計 > 0 を満たすため payments / shares はいずれも 1 件以上で、空配列 insert にはならない。
    const id = crypto.randomUUID();
    await db.batch([
      db.insert(item).values({
        id,
        groupId: member.groupId,
        name,
        // "YYYY-MM-DD" を UTC 0 時として保存する（Workers は UTC 固定で保存・読出が一貫する）。
        // 表示時は UTC で日付部分を取り出すこと（ローカルTZ で解釈すると前日に見える端末が出る）。
        purchasedOn: purchasedOn ? new Date(purchasedOn) : null,
        memo: memo ?? null,
      }),
      db.insert(itemPayment).values(makeRows(id, payments)),
      db.insert(itemShare).values(makeRows(id, shares)),
    ]);

    return c.json({ id }, 201);
  })
  // 購入品を一覧で返す。各 item に合計金額とメンバーごとの payments / shares を埋め込む
  //（送金計算・編集プリフィルに使う）。
  // 絞り込みは 2 通り: 通常は status（既定 unsettled）で絞る。purchasedOn を指定した場合は
  // 「この日に入力済みか」の確認用途のため status を問わず（未精算＋精算済を横断）その購入日で絞る。
  .get(
    "/:groupId/items",
    zValidator(
      "query",
      z.object({
        status: z.enum(["unsettled", "settled"]).default("unsettled"),
        purchasedOn: z.iso.date().optional(),
      }),
    ),
    async (c) => {
      const member = c.get("groupMember");
      const db = c.get("db");
      const { status, purchasedOn } = c.req.valid("query");

      // purchasedOn は POST と同じく "YYYY-MM-DD" → UTC 0 時の timestamp として格納されるため、
      // 同じ日付文字列を new Date() した値と完全一致する（サーバの TZ に依存しない）。
      const conditions = [eq(item.groupId, member.groupId)];
      if (purchasedOn) {
        conditions.push(eq(item.purchasedOn, new Date(purchasedOn)));
      } else {
        conditions.push(eq(item.status, status));
      }

      const rows = await db
        .select()
        .from(item)
        .where(and(...conditions))
        .orderBy(desc(item.createdAt));

      const ids = rows.map((r) => r.id);
      const { paymentsByItem, sharesByItem } = await loadItemAmounts(db, ids);

      return c.json({
        items: rows.map((r) => {
          const itemPayments = paymentsByItem.get(r.id) ?? [];
          return {
            id: r.id,
            name: r.name,
            purchasedOn: r.purchasedOn ? r.purchasedOn.toISOString() : null,
            memo: r.memo,
            status: r.status,
            // 合計金額 = 支払額合計（Issue #19）。
            total: sumAmount(itemPayments),
            payments: itemPayments,
            shares: sharesByItem.get(r.id) ?? [],
          };
        }),
      });
    },
  )
  // 単一の購入品を返す（編集フォームのプリフィル・直リンク対応）。
  .get("/:groupId/items/:itemId", async (c) => {
    const member = c.get("groupMember");
    const db = c.get("db");
    const itemId = c.req.param("itemId");

    const row = await db
      .select()
      .from(item)
      .where(and(eq(item.id, itemId), eq(item.groupId, member.groupId)))
      .get();
    if (!row) {
      return c.json({ error: "Not Found" }, 404);
    }

    // payments / shares は互いに依存しないため並行取得して 1 往復分のレイテンシを削る。
    const [payments, shares] = await Promise.all([
      db
        .select({ userId: itemPayment.userId, amount: itemPayment.amount })
        .from(itemPayment)
        .where(eq(itemPayment.itemId, itemId)),
      db
        .select({ userId: itemShare.userId, amount: itemShare.amount })
        .from(itemShare)
        .where(eq(itemShare.itemId, itemId)),
    ]);

    return c.json({
      item: {
        id: row.id,
        name: row.name,
        purchasedOn: row.purchasedOn ? row.purchasedOn.toISOString() : null,
        memo: row.memo,
        status: row.status,
        total: sumAmount(payments),
        payments,
        shares,
      },
    });
  })
  // 購入品を更新する。バリデーションは保存(POST)と同一。item を更新し、payments / shares は
  // 全削除 → 再挿入で差し替える。これらを db.batch()（all-or-nothing）で原子的に行う。
  .put("/:groupId/items/:itemId", zValidator("json", itemSchema), async (c) => {
    const member = c.get("groupMember");
    const db = c.get("db");
    const itemId = c.req.param("itemId");
    const { name, purchasedOn, memo, payments, shares } = c.req.valid("json");

    const amountError = validateAmounts(payments, shares);
    if (amountError) {
      return c.json({ error: amountError }, 400);
    }

    const memberIds = await groupMemberIds(db, member.groupId);
    const allUserIds = [...payments, ...shares].map((e) => e.userId);
    if (allUserIds.some((id) => !memberIds.has(id))) {
      return c.json({ error: "グループに属さないメンバーが含まれています" }, 400);
    }

    // 対象が当該グループの item として存在するか確認する。精算済（settled）アイテムも
    // 編集可（Issue #24: 精算済の誤り訂正に対応。status 自体はここでは変更しない）。
    const existing = await db
      .select({ id: item.id })
      .from(item)
      .where(and(eq(item.id, itemId), eq(item.groupId, member.groupId)))
      .get();
    if (!existing) {
      return c.json({ error: "Not Found" }, 404);
    }

    // batch は逐次実行されるため、子テーブルの全削除を先に、再挿入を後に置く。
    // 合計 > 0 を満たすため payments / shares はいずれも 1 件以上で、空配列 insert にはならない。
    await db.batch([
      db
        .update(item)
        .set({
          name,
          purchasedOn: purchasedOn ? new Date(purchasedOn) : null,
          memo: memo ?? null,
          updatedAt: new Date(),
        })
        // status は問わないが、groupId の一致は WHERE でも保証する（存在確認との二重防御）。
        .where(and(eq(item.id, itemId), eq(item.groupId, member.groupId))),
      db.delete(itemPayment).where(eq(itemPayment.itemId, itemId)),
      db.delete(itemShare).where(eq(itemShare.itemId, itemId)),
      db.insert(itemPayment).values(makeRows(itemId, payments)),
      db.insert(itemShare).values(makeRows(itemId, shares)),
    ]);

    return c.json({ id: itemId });
  })
  // 購入品を削除する。未精算・精算済を問わず削除できる（Issue #24）。
  // item_payment / item_share は外部キー CASCADE で消える（groups と同方針）。
  .delete("/:groupId/items/:itemId", async (c) => {
    const member = c.get("groupMember");
    const db = c.get("db");
    const itemId = c.req.param("itemId");

    const deleted = await db
      .delete(item)
      .where(and(eq(item.id, itemId), eq(item.groupId, member.groupId)))
      .returning({ id: item.id });
    if (deleted.length === 0) {
      return c.json({ error: "Not Found" }, 404);
    }

    return c.json({ deleted: true });
  })
  // 精算を実行する（Issue #22）。選択された未精算アイテムを settled に一括更新する。
  // クライアントが画面で確認した送金リスト（transfers）を受け取り、DB 上の payments / shares から
  // 共有ロジックで再計算した結果と完全一致しなければ 409 で拒否する（ADR-0013）。
  // 一覧が古い（選択アイテムが削除・精算済み）場合も同様に 409 で拒否し、
  // 「表示された送金リスト = サーバー上のデータから導かれる送金リスト」を確定前に保証する。
  .post(
    "/:groupId/settlements",
    zValidator(
      "json",
      z.object({
        itemIds: z.array(z.string().min(1)).min(1),
        // 選択分の収支が均衡していれば空配列（送金不要）もあり得る。
        transfers: z.array(transferEntry),
      }),
    ),
    async (c) => {
      const member = c.get("groupMember");
      const db = c.get("db");
      const { itemIds: rawItemIds, transfers } = c.req.valid("json");
      // スキーマは重複 id を許すため、先に除去して以後は一意な配列として扱う。
      // SQL の IN は重複を無視するので挙動は変わらず、下の鮮度チェックが素直な件数比較になる。
      const itemIds = [...new Set(rawItemIds)];

      // 対象アイテムを取得する（groupId 一致・未精算のみ）。選択された id と一致しなければ
      // クライアントの一覧が古い（削除・精算済み・他グループ混入）ので拒否する。
      const rows = await db
        .select({ id: item.id })
        .from(item)
        .where(
          and(
            eq(item.groupId, member.groupId),
            eq(item.status, "unsettled"),
            inArray(item.id, itemIds),
          ),
        );
      const foundIds = rows.map((r) => r.id);
      if (foundIds.length !== itemIds.length) {
        return c.json(
          {
            error:
              "精算できないアイテムが含まれています。一覧を最新の状態にしてからやり直してください",
          },
          409,
        );
      }

      // 対象アイテムの payments / shares から送金リストを再計算し、提示済みのものと突き合わせる。
      // 読み込みは GET /items と同じ loadItemAmounts に揃える（一覧表示と検証の入力を一致させる）。
      const { paymentsByItem, sharesByItem } = await loadItemAmounts(db, foundIds);
      const expected = computeSettlements(
        foundIds.map((id) => ({
          payments: paymentsByItem.get(id) ?? [],
          shares: sharesByItem.get(id) ?? [],
        })),
      );
      if (!transfersEqual(expected, transfers)) {
        return c.json(
          {
            error:
              "送金リストが最新のデータと一致しません。一覧を最新の状態にしてからやり直してください",
          },
          409,
        );
      }

      // D1 は対話的トランザクション非対応のため、検証（SELECT）と更新（UPDATE）の間に他リクエストが
      // 割り込む余地は残る。WHERE の groupId / status 条件を多重防御として維持し許容する（ADR-0013）。
      const settled = await db
        .update(item)
        .set({ status: "settled", updatedAt: new Date() })
        .where(
          and(
            eq(item.groupId, member.groupId),
            eq(item.status, "unsettled"),
            inArray(item.id, itemIds),
          ),
        )
        .returning({ id: item.id });

      return c.json({ settled: settled.map((r) => r.id) });
    },
  )
  // 精算を取り消し、未精算に戻す（Issue #24）。POST /settlements の逆操作。
  // groupId 一致かつ status = "settled" の id だけを対象にし、他グループや未精算の巻き込みを防ぐ。
  // 実際に更新できた id を返す（存在しない / 既に未精算の id は黙って無視される）。
  .post(
    "/:groupId/unsettlements",
    zValidator("json", z.object({ itemIds: z.array(z.string().min(1)).min(1) })),
    async (c) => {
      const member = c.get("groupMember");
      const db = c.get("db");
      const { itemIds } = c.req.valid("json");

      const unsettled = await db
        .update(item)
        .set({ status: "unsettled", updatedAt: new Date() })
        .where(
          and(
            eq(item.groupId, member.groupId),
            eq(item.status, "settled"),
            inArray(item.id, itemIds),
          ),
        )
        .returning({ id: item.id });

      return c.json({ unsettled: unsettled.map((r) => r.id) });
    },
  );
