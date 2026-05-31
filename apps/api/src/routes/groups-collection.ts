import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AuthVariables, DbVariables } from "../context";
import { group, groupMember } from "../db/schema";

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
      // D1 は基底型 BaseSQLiteDatabase 経由ではバッチ/トランザクションを扱えないため逐次挿入とする。
      // 仮に member 挿入が失敗してもオーナー不在のグループは誰の一覧にも現れず実害がない。
      const id = crypto.randomUUID();
      await db.insert(group).values({ id, name });
      await db.insert(groupMember).values({ groupId: id, userId: user.id, role: "owner" });

      return c.json({ id, name }, 201);
    },
  )
  .get("/", async (c) => {
    const user = c.get("user");
    const db = c.get("db");

    // 自分が所属するグループだけを返す。group_member を起点に join し、
    // オーナー不在などのゴミデータ（group 単独行）を拾わないようにする（ADR-0010）。
    const groups = await db
      .select({ id: group.id, name: group.name, role: groupMember.role })
      .from(groupMember)
      .innerJoin(group, eq(groupMember.groupId, group.id))
      .where(eq(groupMember.userId, user.id))
      .orderBy(groupMember.joinedAt);

    return c.json({ groups });
  });
