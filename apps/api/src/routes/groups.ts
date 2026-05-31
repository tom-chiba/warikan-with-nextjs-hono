import { Hono } from "hono";
import type { GroupMemberVariables } from "../context";

// /groups/:groupId 配下の保護ルート。
// 認可ミドルウェア（requireAuth / requireGroupMember）は index.ts 側でマウントするため、
// ここでは Bindings(Env) を持たず Variables だけ型付けする。これにより rpc.ts の AppType に
// Workers 固有型が混入せず、フロントエンドが型解決できる状態を保てる。
export const groups = new Hono<{ Variables: GroupMemberVariables }>().get(
  "/:groupId/members",
  (c) => {
    const member = c.get("groupMember");
    return c.json({ groupId: member.groupId, role: member.role });
  },
);
