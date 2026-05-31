import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AuthVariables, DbVariables } from "../context";
import { group, groupInvitation, groupMember } from "../db/schema";
import { isActiveInvitation } from "../lib/invitation";

// 招待トークンからの参加フロー用ルート。ログインは必須だが、まだ当該グループのメンバーではないため
// requireGroupMember は通さない（index.ts で /invitations/* に requireAuth + provideDb のみ適用）。
// Bindings(Env) は持たせず Variables だけ型付けする（ADR-0009 / ADR-0010）。
export const invitations = new Hono<{
  Variables: AuthVariables & DbVariables;
}>()
  // 招待のプレビュー。グループ名と有効性、既に参加済みかを返す。無効/期限切れ/失効は valid: false。
  .get("/:token", async (c) => {
    const token = c.req.param("token");
    const user = c.get("user");
    const db = c.get("db");

    const invitation = await db
      .select({
        groupId: groupInvitation.groupId,
        groupName: group.name,
        expiresAt: groupInvitation.expiresAt,
        revokedAt: groupInvitation.revokedAt,
      })
      .from(groupInvitation)
      .innerJoin(group, eq(groupInvitation.groupId, group.id))
      .where(eq(groupInvitation.token, token))
      .get();

    if (!invitation || !isActiveInvitation(invitation)) {
      return c.json({ valid: false } as const);
    }

    const membership = await db
      .select({ userId: groupMember.userId })
      .from(groupMember)
      .where(and(eq(groupMember.groupId, invitation.groupId), eq(groupMember.userId, user.id)))
      .get();

    return c.json({
      valid: true,
      groupId: invitation.groupId,
      groupName: invitation.groupName,
      alreadyMember: membership !== undefined,
    } as const);
  })
  // 招待を受けてグループに参加する。既にメンバーなら二重参加させず冪等に成功扱い。
  // 無効/期限切れ/失効トークンは 410 を返す。
  .post("/:token/accept", async (c) => {
    const token = c.req.param("token");
    const user = c.get("user");
    const db = c.get("db");

    const invitation = await db
      .select({
        groupId: groupInvitation.groupId,
        expiresAt: groupInvitation.expiresAt,
        revokedAt: groupInvitation.revokedAt,
      })
      .from(groupInvitation)
      .where(eq(groupInvitation.token, token))
      .get();

    if (!invitation || !isActiveInvitation(invitation)) {
      return c.json({ error: "Invalid or expired invitation" }, 410);
    }

    // 既メンバーでも二重参加させず冪等にする。SELECT→INSERT の競合（同時リクエストでの
    // 複合主キー違反）を避けるため onConflictDoNothing を使う。
    await db
      .insert(groupMember)
      .values({ groupId: invitation.groupId, userId: user.id, role: "member" })
      .onConflictDoNothing();

    return c.json({ groupId: invitation.groupId });
  });
