import { eq } from "drizzle-orm";
import type { DbVariables } from "../context";
import { groupMember, user } from "../db/schema";

// グループのメンバー一覧（表示用情報つき・joinedAt 昇順・ISO 文字列化済み）を返す。
// GET /groups/:groupId/members と GET /groups のクイック入力用メンバー同梱で共通利用する。
export async function selectGroupMembers(db: DbVariables["db"], groupId: string) {
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
    .where(eq(groupMember.groupId, groupId))
    .orderBy(groupMember.joinedAt);

  return members.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() }));
}
