"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { SessionPending, SignInPrompt } from "@/components/session-states";
import { apiClient } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";
import { useGroupMembers } from "@/lib/use-group-members";
import { useGroups } from "@/lib/use-groups";
import { GroupNameEditor } from "./group-name-editor";
import { MemberRow } from "./member-row";

export default function GroupPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 現在有効な招待リンク（未失効・期限内）を取得する。
  const { data: inviteData, error: fetchError } = useQuery({
    queryKey: ["invitation", groupId],
    enabled: !!session,
    queryFn: async () => {
      const res = await apiClient.groups[":groupId"].invitations.active.$get({
        param: { groupId },
      });
      if (!res.ok) {
        throw new Error("招待リンクの取得に失敗しました");
      }
      return res.json();
    },
  });

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

  const invitation = inviteData?.invitation ?? null;
  const inviteUrl =
    invitation && typeof window !== "undefined"
      ? `${window.location.origin}/invite/${invitation.token}`
      : null;

  const members = membersData?.members ?? [];
  const currentUserId = session.user.id;
  const isOwner = members.some((m) => m.userId === currentUserId && m.role === "owner");
  // キャッシュ未着の間は null（見出しは固定テキスト「グループ」にフォールバック）。
  const groupName = groupsData?.groups.find((g) => g.id === groupId)?.name ?? null;

  async function handleGenerate() {
    setError(null);
    setBusy(true);
    try {
      const res = await apiClient.groups[":groupId"].invitations.$post({ param: { groupId } });
      if (!res.ok) {
        throw new Error("招待リンクの発行に失敗しました");
      }
      await queryClient.invalidateQueries({ queryKey: ["invitation", groupId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "招待リンクの発行に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(token: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await apiClient.groups[":groupId"].invitations[":token"].$delete({
        param: { groupId, token },
      });
      if (!res.ok) {
        throw new Error("招待リンクの無効化に失敗しました");
      }
      await queryClient.invalidateQueries({ queryKey: ["invitation", groupId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "招待リンクの無効化に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy(url: string) {
    setError(null);
    try {
      // クリップボード API は非安全オリジンや権限拒否で reject されうるため捕捉する。
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("コピーに失敗しました。リンクを手動で選択してコピーしてください。");
    }
  }

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
    setError(null);
    setBusy(true);
    try {
      const res = await apiClient.groups[":groupId"].members[":userId"].$delete({
        param: { groupId, userId },
      });
      if (!res.ok) {
        throw new Error(isSelf ? "退出に失敗しました" : "メンバーの削除に失敗しました");
      }
      if (isSelf) {
        // 退出したらこのグループの画面には留まれないため一覧へ戻る。
        // この画面では ["groups"] のオブザーバが居ない（非アクティブ）ため、refetchType: "all" で
        // その場で再取得まで済ませる。ルート（/）が退出済みグループのクイック入力を出すのを防ぐ。
        await queryClient.invalidateQueries({ queryKey: ["groups"], refetchType: "all" });
        router.push("/groups");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["members", groupId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作に失敗しました");
    } finally {
      setBusy(false);
    }
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

      {/* 招待リンク取得失敗・各操作のエラーをここに集約表示する。 */}
      {(error || fetchError) && (
        <p className="note-danger w-full">
          {error ??
            (fetchError instanceof Error ? fetchError.message : "招待リンクの取得に失敗しました")}
        </p>
      )}

      <section className="flex w-full flex-col gap-3">
        <h2 className="section-title section-rule">招待リンク</h2>
        {inviteUrl ? (
          <div className="flex flex-col gap-2">
            <p className="note-muted">
              このリンクを共有するとメンバーを招待できます（有効期限あり）。
            </p>
            <code className="break-all border border-rule bg-ink/5 px-3 py-2 font-mono text-xs">
              {inviteUrl}
            </code>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => handleCopy(inviteUrl)} className="btn btn-line">
                {copied ? "コピーしました" : "コピー"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => invitation && handleRevoke(invitation.token)}
                className="btn btn-line-danger"
              >
                無効化
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleGenerate}
                className="btn btn-line"
              >
                再発行
              </button>
            </div>
          </div>
        ) : (
          <button type="button" disabled={busy} onClick={handleGenerate} className="btn btn-fill">
            招待リンクを発行
          </button>
        )}
      </section>

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
