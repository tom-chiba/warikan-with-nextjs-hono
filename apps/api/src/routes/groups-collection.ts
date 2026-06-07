import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AuthVariables, DbVariables } from "../context";
import { group, groupMember } from "../db/schema";
import { buildGroupList } from "../lib/group-list";

// /groups のコレクションレベル（:groupId を伴わない）ルート。
// メンバーシップは不要だがログインは必須なため、index.ts 側で requireAuth() + provideDb() を適用する。
// member 限定の /groups/:groupId/* は routes/groups.ts 側で扱う。
// Bindings(Env) は持たせず Variables だけ型付けし、AppType に Workers 固有型を混ぜない（ADR-0009）。
export const groupsCollection = new Hono<{
  Variables: AuthVariables & DbVariables;
}>()
  .post(
    "/",
    zValidator("json", z.object({ name: z.string().trim().min(1).max(100) })),
    async (c) => {
      const { name } = c.req.valid("json");
      const user = c.get("user");
      const db = c.get("db");

      // 作成者を owner として group_member に登録する。id は JS 側で確定させ、両テーブルで共有する。
      // group と group_member の挿入は原子的でなければならない（片方だけ成功するとオーナー不在の
      // ゴミグループが残る）。D1 は対話的トランザクション非対応で db.transaction() が実行時に失敗する
      // ため、暗黙の SQL トランザクションとして all-or-nothing を保証する db.batch() を使う。
      const id = crypto.randomUUID();
      await db.batch([
        db.insert(group).values({ id, name }),
        db.insert(groupMember).values({ groupId: id, userId: user.id, role: "owner" }),
      ]);

      return c.json({ id, name }, 201);
    },
  )
  .get("/", async (c) => {
    const user = c.get("user");
    const db = c.get("db");

    // 自分が所属するグループだけを返す。group_member を起点に join し、
    // オーナー不在などのゴミデータ（group 単独行）を拾わないようにする（ADR-0010）。
    // joinedAt が同値（短時間に複数作成）でも順序が一意に定まるよう group.id をタイブレークに足す。
    const rows = await db
      .select({
        id: group.id,
        name: group.name,
        role: groupMember.role,
        lastViewedAt: groupMember.lastViewedAt,
      })
      .from(groupMember)
      .innerJoin(group, eq(groupMember.groupId, group.id))
      .where(eq(groupMember.userId, user.id))
      .orderBy(groupMember.joinedAt, group.id);

    // カレントグループ = 最後に開いたグループ（last_viewed_at が最大の行）。一度も記録がなければ null。
    // 一覧取得に同梱することで、カレント解決のための追加の往復を発生させない（#51）。
    return c.json(buildGroupList(rows));
  });
