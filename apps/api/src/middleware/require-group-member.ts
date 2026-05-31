import { and, eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import type { DbVariables, GroupMemberVariables } from "../context";
import { createDb } from "../db";
import { groupMember } from "../db/schema";

// 呼び出しユーザーがパスパラメータ :groupId のグループのメンバーかを検証する。
// requireAuth の後段に置く前提で、user は c.get("user") から取得する。
// 非メンバーなら 403、:groupId 欠落時は 400 を返し、通過時は group_member をコンテキストに格納する。
export const requireGroupMember = (): MiddlewareHandler<{
  Bindings: Env;
  Variables: GroupMemberVariables & Partial<DbVariables>;
}> => {
  return async (c, next) => {
    const groupId = c.req.param("groupId");
    if (!groupId) {
      return c.json({ error: "Bad Request" }, 400);
    }
    // requireAuth が前段で user を格納している前提。単体・順序誤用時の防御として確認する。
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    // 通常は前段の provideDb が注入したインスタンスを使い回す（リクエスト内での二重生成を避ける）。
    // 単体・順序誤用で未注入のときは自前生成にフォールバックして独立動作も保つ。
    const db = c.get("db") ?? createDb(c.env.DB);

    const member = await db
      .select()
      .from(groupMember)
      .where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, user.id)))
      .get();

    if (!member) {
      return c.json({ error: "Forbidden" }, 403);
    }
    c.set("groupMember", member);
    await next();
  };
};
