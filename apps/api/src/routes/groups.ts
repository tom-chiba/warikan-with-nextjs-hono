import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { Hono } from "hono";
import type { DbVariables, GroupMemberVariables } from "../context";
import { group, groupInvitation, groupMember, user } from "../db/schema";
import { generateInvitationToken } from "../lib/token";

// 招待リンクの有効期限（発行から 7 日間）。
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// /groups/:groupId 配下の保護ルート（当該グループのメンバー限定）。
// 認可ミドルウェア（requireAuth / provideDb / requireGroupMember）は index.ts 側でマウントするため、
// ここでは Bindings(Env) を持たず Variables だけ型付けする。これにより rpc.ts の AppType に
// Workers 固有型が混入せず、フロントエンドが型解決できる状態を保てる（ADR-0009 / ADR-0010）。
export const groups = new Hono<{
  Variables: GroupMemberVariables & DbVariables;
}>()
  // グループのメンバー一覧を返す。各メンバーの表示用情報（name/email）と role/joinedAt を含む。
  .get("/:groupId/members", async (c) => {
    const member = c.get("groupMember");
    const db = c.get("db");

    const members = await db
      .select({
        userId: groupMember.userId,
        name: user.name,
        email: user.email,
        role: groupMember.role,
        joinedAt: groupMember.joinedAt,
      })
      .from(groupMember)
      .innerJoin(user, eq(groupMember.userId, user.id))
      .where(eq(groupMember.groupId, member.groupId))
      .orderBy(groupMember.joinedAt);

    return c.json({
      members: members.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() })),
    });
  })
  // メンバーを削除（他者削除）または退出（自分の削除）する。
  // 自分自身は常に退出可。他メンバーの削除は owner のみ可。
  // 最後の 1 人が抜けた場合はグループ自体も削除する（関連データは CASCADE で消える）。
  .delete("/:groupId/members/:userId", async (c) => {
    const caller = c.get("groupMember");
    const targetUserId = c.req.param("userId");
    const db = c.get("db");

    const isSelf = targetUserId === caller.userId;
    if (!isSelf && caller.role !== "owner") {
      return c.json({ error: "Forbidden" }, 403);
    }

    const deleted = await db
      .delete(groupMember)
      .where(and(eq(groupMember.groupId, caller.groupId), eq(groupMember.userId, targetUserId)))
      .returning({ userId: groupMember.userId });
    if (deleted.length === 0) {
      return c.json({ error: "Not Found" }, 404);
    }

    // 残りメンバーが 0 ならグループを削除する（最後の 1 人の退出）。
    const remaining = await db
      .select({ userId: groupMember.userId })
      .from(groupMember)
      .where(eq(groupMember.groupId, caller.groupId))
      .all();
    const groupDeleted = remaining.length === 0;
    if (groupDeleted) {
      await db.delete(group).where(eq(group.id, caller.groupId));
    }

    return c.json({ removed: true, groupDeleted });
  })
  // 招待リンクを発行する（メンバーなら誰でも可）。
  // グループごとに有効リンクは原則 1 本にするため、既存の未失効トークンを失効させてから新規発行する。
  // D1 はバッチ非対応のため失効 UPDATE と発行 INSERT は非アトミック。両者の間で処理が中断すると
  // 一時的に有効リンクが 0 本になりうるが、再発行で自己回復するため許容する（ADR-0010）。
  .post("/:groupId/invitations", async (c) => {
    const member = c.get("groupMember");
    const user = c.get("user");
    const db = c.get("db");

    const now = new Date();
    await db
      .update(groupInvitation)
      .set({ revokedAt: now })
      .where(and(eq(groupInvitation.groupId, member.groupId), isNull(groupInvitation.revokedAt)));

    const token = generateInvitationToken();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
    await db.insert(groupInvitation).values({
      token,
      groupId: member.groupId,
      invitedBy: user.id,
      expiresAt,
    });

    return c.json({ token, expiresAt: expiresAt.toISOString() }, 201);
  })
  // 現在有効な招待リンク（未失効かつ期限内）を返す。無ければ null。コピー表示用。
  .get("/:groupId/invitations/active", async (c) => {
    const member = c.get("groupMember");
    const db = c.get("db");

    const active = await db
      .select({ token: groupInvitation.token, expiresAt: groupInvitation.expiresAt })
      .from(groupInvitation)
      .where(
        and(
          eq(groupInvitation.groupId, member.groupId),
          isNull(groupInvitation.revokedAt),
          gt(groupInvitation.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(groupInvitation.createdAt))
      .get();

    return c.json({
      invitation: active
        ? { token: active.token, expiresAt: active.expiresAt.toISOString() }
        : null,
    });
  })
  // 招待リンクを無効化する。グループスコープで絞り込み、他グループのトークンは失効できないようにする。
  // 対象は未失効トークン（revokedAt IS NULL）。期限切れだが未失効のトークンへの無効化は冪等に成功扱いとする
  //（期限切れは既に無効なため実害なし）。存在しない/失効済み/別グループのトークンは 404。
  .delete("/:groupId/invitations/:token", async (c) => {
    const member = c.get("groupMember");
    const token = c.req.param("token");
    const db = c.get("db");

    const revoked = await db
      .update(groupInvitation)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(groupInvitation.token, token),
          eq(groupInvitation.groupId, member.groupId),
          isNull(groupInvitation.revokedAt),
        ),
      )
      .returning({ token: groupInvitation.token });

    if (revoked.length === 0) {
      return c.json({ error: "Not Found" }, 404);
    }
    return c.json({ revoked: true });
  });
