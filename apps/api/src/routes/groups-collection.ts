import { zValidator } from "@hono/zod-validator";
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
}>().post(
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
);
