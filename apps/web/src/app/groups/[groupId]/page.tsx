"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { SessionPending, SignInPrompt } from "@/components/session-states";
import { apiClient } from "@/lib/api-client";
import { useAsyncAction } from "@/lib/use-async-action";
import { groupKeys, memberKeys } from "@/lib/query-keys";
import { useGroupMembers } from "@/lib/use-group-members";
import { useGroups } from "@/lib/use-groups";
import { useResolvedSession } from "@/lib/use-resolved-session";
import { GroupNameEditor } from "./group-name-editor";
import { InvitationSection } from "./invitation-section";
import { MemberRow } from "./member-row";

export default function GroupPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;
  const { data: session, isPending } = useResolvedSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { busy, error, run } = useAsyncAction();

  // メンバー一覧を取得する。
  const { data: membersData } = useGroupMembers(groupId, !!session);

  // 見出しに出すグループ名は ["groups"] キャッシュから引く（#65）。
  // 他ページで取得済みならキャッシュヒットし追加往復は発生しない。
  const { data: groupsData } = useGroups(!!session);

  if (isPending) {
    return <SessionPending />;
  }

  if (!session) {
    return <SignInPrompt />;
  }

  const members = membersData?.members ?? [];
  const currentUserId = session.user.id;
  const isOwner = members.some((m) => m.userId === currentUserId && m.role === "owner");
  // キャッシュ未着の間は null（見出しは固定テキスト「グループ」にフォールバック）。
  const groupName = groupsData?.groups.find((g) => g.id === groupId)?.name ?? null;

  async function handleRemove(userId: string, isSelf: boolean, name: string) {
    // 退出・削除は取り消せない破壊的操作なので確認を挟む。
    // 自分が最後の 1 人なら退出でグループ本体（と関連データ）が消えるため、その旨を明示する。
    const isLastMember = isSelf && members.length === 1;
    const message = isLastMember
      ? "あなたが退出するとこのグループは削除されます。よろしいですか？"
      : isSelf
        ? "このグループから退出しますか？"
        : `「${name}」をグループから削除しますか？`;
    if (!window.confirm(message)) {
      return;
    }
    await run(async () => {
      const res = await apiClient.groups[":groupId"].members[":userId"].$delete({
        param: { groupId, userId },
      });
      if (!res.ok) {
        throw new Error(isSelf ? "退出に失敗しました" : "メンバーの削除に失敗しました");
      }
      if (isSelf) {
        // 退出したらこのグループの画面には留まれないため一覧へ戻る。
        // 直後の遷移でこの画面の ["groups"] オブザーバ（見出しの useGroups、#65）が消えるため、
        // オブザーバの状態に依存しない refetchType: "all" でその場で再取得まで済ませる。
        // ルート（/）が退出済みグループのクイック入力を出すのを防ぐ。
        await queryClient.invalidateQueries({ queryKey: groupKeys.all(), refetchType: "all" });
        router.push("/groups");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: memberKeys.byGroup(groupId) });
    }, "操作に失敗しました");
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-5 py-6">
      <div className="flex flex-col gap-1">
        <span className="kicker">Group</span>
        <GroupNameEditor groupId={groupId} groupName={groupName} isOwner={isOwner} />
        <p className="note-muted">
          グループ ID: <span className="font-mono text-xs">{groupId}</span>
        </p>
      </div>

      {/* メンバー削除・退出のエラーをここに表示する（招待リンクのエラーは InvitationSection 内に表示）。 */}
      {error && <p className="note-danger w-full">{error}</p>}

      <InvitationSection groupId={groupId} />

      <section className="flex w-full flex-col gap-3">
        <h2 className="section-title section-rule">メンバー</h2>
        {members.length === 0 ? (
          <p className="note-muted">読み込み中…</p>
        ) : (
          <ul className="flex flex-col">
            {members.map((m) => {
              const isSelf = m.userId === currentUserId;
              return (
                <MemberRow
                  key={m.userId}
                  groupId={groupId}
                  member={m}
                  isSelf={isSelf}
                  canRemove={isSelf || isOwner}
                  accountName={session.user.name}
                  busy={busy}
                  onRemove={() => handleRemove(m.userId, isSelf, m.name)}
                />
              );
            })}
          </ul>
        )}
      </section>

      {/* 入力・一覧の常設ナビはメインページが担うが、設定動線からこのグループの明細へ
          直接移れるよう一覧へのショートカットだけ残す（開くとカレントグループも切り替わる）。 */}
      <div className="flex gap-5">
        <Link href={`/groups/${groupId}/items`} className="link-quiet">
          購入品一覧
        </Link>
        <Link href="/groups" className="link-quiet">
          グループ一覧へ
        </Link>
      </div>
    </main>
  );
}
