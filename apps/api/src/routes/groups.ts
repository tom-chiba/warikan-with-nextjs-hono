import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gt, isNull, notExists } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { DbVariables, GroupMemberVariables } from "../context";
import { group, groupInvitation, groupMember } from "../db/schema";
import { selectGroupMembers } from "../lib/group-members";
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
  // グループ名を変更する（#65）。メンバー削除の他者削除と同様に owner のみ可。
  // パスは /groups/:groupId 自体（サブパスなし）だが、index.ts の app.use("/groups/:groupId/*")
  // は末尾ワイルドカードが空にもマッチするため、このルートにも requireGroupMember が適用される
  //（非メンバー 403 はテストで担保）。name のバリデーションは作成（groups-collection）と同一。
  // updated_at は $defaultFn が INSERT 時にしか効かないため UPDATE で明示的に更新する。
  .patch(
    "/:groupId",
    zValidator("json", z.object({ name: z.string().trim().min(1).max(100) })),
    async (c) => {
      const member = c.get("groupMember");
      const db = c.get("db");
      const { name } = c.req.valid("json");

      if (member.role !== "owner") {
        return c.json({ error: "Forbidden" }, 403);
      }

      await db
        .update(group)
        .set({ name, updatedAt: new Date() })
        .where(eq(group.id, member.groupId));

      return c.json({ ok: true });
    },
  )
  // このグループを「最後に開いた」として記録する（カレントグループの更新、#51）。
  // メンバーシップは requireGroupMember で検証済みのため、自分のメンバーシップ行の
  // last_viewed_at を打つだけでよい。GET /groups が最大値の行をカレントとして返す。
  .put("/:groupId/last-viewed", async (c) => {
    const member = c.get("groupMember");
    const db = c.get("db");

    await db
      .update(groupMember)
      .set({ lastViewedAt: new Date() })
      .where(and(eq(groupMember.groupId, member.groupId), eq(groupMember.userId, member.userId)));

    return c.json({ ok: true });
  })
  // グループのメンバー一覧を返す。各メンバーの表示用情報（name/email）と role/joinedAt を含む。
  .get("/:groupId/members", async (c) => {
    const member = c.get("groupMember");
    const db = c.get("db");

    return c.json({ members: await selectGroupMembers(db, member.groupId) });
  })
  // 自分のグループ内表示名を設定・変更する（#64）。
  // 変更できるのは自分のメンバーシップ行だけなので、パスは :userId ではなく me で表現する
  //（リテラルセグメントをパラメータルート :userId より先にチェーンし、"me" が :userId に
  //  マッチしないようにする）。requireGroupMember 済みの userId で UPDATE するため、
  //  本人チェックのコードは不要で「自分のみ変更可」が構造的に保証される。
  // 空・空白のみは trim 後の min(1) で弾く。クリア（null に戻す）操作は提供しない。
  .put(
    "/:groupId/members/me/display-name",
    zValidator("json", z.object({ displayName: z.string().trim().min(1).max(100) })),
    async (c) => {
      const member = c.get("groupMember");
      const db = c.get("db");
      const { displayName } = c.req.valid("json");

      await db
        .update(groupMember)
        .set({ displayName })
        .where(and(eq(groupMember.groupId, member.groupId), eq(groupMember.userId, member.userId)));

      return c.json({ ok: true });
    },
  )
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

    // メンバー削除と「最後の 1 人なら group も削除」を 1 つの batch（D1 の暗黙の SQL トランザクション
    // ＝ all-or-nothing）で原子的に行う。group 削除はメンバー削除後の残数に依存するため、その条件を
    // NOT EXISTS サブクエリで SQL 内に閉じ込め、batch 内の逐次実行（2 文目は 1 文目の削除を観測する）
    // に委ねる。これにより「メンバーだけ消えて group 削除が漏れる」中間状態が発生しない。
    // group 削除時の関連データ（invitation 等）は外部キー CASCADE で消える。
    // D1 は対話的トランザクション（db.transaction()）非対応のため batch を用いる（groups-collection と同方針）。
    const [deleted, deletedGroup] = await db.batch([
      db
        .delete(groupMember)
        .where(and(eq(groupMember.groupId, caller.groupId), eq(groupMember.userId, targetUserId)))
        .returning({ userId: groupMember.userId }),
      db
        .delete(group)
        .where(
          and(
            eq(group.id, caller.groupId),
            notExists(db.select().from(groupMember).where(eq(groupMember.groupId, caller.groupId))),
          ),
        )
        .returning({ id: group.id }),
    ]);

    // 対象メンバーが存在しなければ削除は 0 件（404）。このとき呼び出し元は必ずメンバーとして残る
    // ため group も削除されず、batch は無害（何も変更しない）。
    if (deleted.length === 0) {
      return c.json({ error: "Not Found" }, 404);
    }

    return c.json({ removed: true, groupDeleted: deletedGroup.length > 0 });
  })
  // 招待リンクを発行する（メンバーなら誰でも可）。
  // グループごとに有効リンクは原則 1 本にするため、既存の未失効トークンを失効させてから新規発行する。
  // 失効 UPDATE と発行 INSERT はいずれも事前に値が確定する独立文なので、db.batch()（D1 の暗黙の
  // SQL トランザクション = all-or-nothing）で 1 トランザクションにまとめて原子化する。これにより
  // 「失効だけ済んで発行に失敗し、有効リンクが一時的に 0 本になる」中間状態が生じない（ADR-0010）。
  // batch は逐次実行されるため、先に既存の未失効トークンを失効 → 後から新規トークンを挿入する
  //（失効 UPDATE の時点で新トークンはまだ存在しないため、新トークンが巻き添えで失効することはない）。
  .post("/:groupId/invitations", async (c) => {
    const member = c.get("groupMember");
    const user = c.get("user");
    const db = c.get("db");

    const now = new Date();
    const token = generateInvitationToken();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
    await db.batch([
      db
        .update(groupInvitation)
        .set({ revokedAt: now })
        .where(and(eq(groupInvitation.groupId, member.groupId), isNull(groupInvitation.revokedAt))),
      db.insert(groupInvitation).values({
        token,
        groupId: member.groupId,
        invitedBy: user.id,
        expiresAt,
      }),
    ]);

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
