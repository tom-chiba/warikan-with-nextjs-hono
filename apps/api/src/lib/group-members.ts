import { eq } from "drizzle-orm";
import type { DbVariables } from "../context";
import { groupMember, user } from "../db/schema";

// グループのメンバー一覧（表示用情報つき・joinedAt 昇順・ISO 文字列化済み）を返す。
// GET /groups/:groupId/members と GET /groups のクイック入力用メンバー同梱で共通利用する。
// name はグループ内表示名へのフォールバック（displayName ?? user.name）をここで解決して返す（#64）。
// 全画面が ["members", groupId] キャッシュの name を参照するため、解決をこの 1 箇所に集約すると
// 表示側はフォールバックを意識せずに済む。displayName（生値）は編集 UI の「設定済みか」の判定と
// プレフィルにだけ使う。
export async function selectGroupMembers(db: DbVariables["db"], groupId: string) {
  const members = await db
    .select({
      userId: groupMember.userId,
      name: user.name,
      displayName: groupMember.displayName,
      email: user.email,
      role: groupMember.role,
      joinedAt: groupMember.joinedAt,
    })
    .from(groupMember)
    .innerJoin(user, eq(groupMember.userId, user.id))
    .where(eq(groupMember.groupId, groupId))
    .orderBy(groupMember.joinedAt);

  return members.map((m) => ({
    ...m,
    name: m.displayName ?? m.name,
    joinedAt: m.joinedAt.toISOString(),
  }));
}
