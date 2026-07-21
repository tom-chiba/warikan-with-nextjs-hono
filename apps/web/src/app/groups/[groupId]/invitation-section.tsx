"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiClient } from "@/lib/api-client";
import { invitationKeys } from "@/lib/query-keys";
import { useAsyncAction } from "@/lib/use-async-action";

// グループ詳細ページの招待リンク管理セクション（#131）。
// GroupNameEditor / MemberRow と同じく、招待リンクの取得・発行・無効化・コピーと
// その busy/error・コピー完了フラグはこのセクションの関心事としてここに閉じ込め、
// ページ側は構成（見出し・招待・メンバー）に専念させる。
// このコンポーネントはセッション確定後にのみ描画されるため、クエリは常に有効。

export function InvitationSection({ groupId }: { groupId: string }) {
  const queryClient = useQueryClient();
  const { busy, error, run, setError } = useAsyncAction();
  const [copied, setCopied] = useState(false);

  // 現在有効な招待リンク（未失効・期限内）を取得する。
  const { data: inviteData, error: fetchError } = useQuery({
    queryKey: invitationKeys.active(groupId),
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

  const invitation = inviteData?.invitation ?? null;
  const inviteUrl =
    invitation && typeof window !== "undefined"
      ? `${window.location.origin}/invite/${invitation.token}`
      : null;

  async function handleGenerate() {
    await run(async () => {
      const res = await apiClient.groups[":groupId"].invitations.$post({ param: { groupId } });
      if (!res.ok) {
        throw new Error("招待リンクの発行に失敗しました");
      }
      await queryClient.invalidateQueries({ queryKey: invitationKeys.active(groupId) });
    }, "招待リンクの発行に失敗しました");
  }

  async function handleRevoke(token: string) {
    await run(async () => {
      const res = await apiClient.groups[":groupId"].invitations[":token"].$delete({
        param: { groupId, token },
      });
      if (!res.ok) {
        throw new Error("招待リンクの無効化に失敗しました");
      }
      await queryClient.invalidateQueries({ queryKey: invitationKeys.active(groupId) });
    }, "招待リンクの無効化に失敗しました");
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

  return (
    <section className="flex w-full flex-col gap-3">
      <h2 className="section-title section-rule">招待リンク</h2>
      {/* 招待リンク取得失敗・各操作のエラーをここに集約表示する。 */}
      {(error || fetchError) && (
        <p className="note-danger w-full">
          {error ??
            (fetchError instanceof Error ? fetchError.message : "招待リンクの取得に失敗しました")}
        </p>
      )}
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
            <button type="button" disabled={busy} onClick={handleGenerate} className="btn btn-line">
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
  );
}
