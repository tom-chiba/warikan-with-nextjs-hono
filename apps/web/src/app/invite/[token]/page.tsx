"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { AuthPanel } from "@/app/auth-panel";
import { VerificationSentNotice } from "@/app/verification-sent-notice";
import { SessionPending } from "@/components/session-states";
import { apiClient } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 招待ページからのサインアップ（#69 の仮登録）後に出す確認メール案内。
  // page.tsx と同じく、セッション再取得の isPending で消えないよう isPending 判定より前に出す。
  const [signedUpEmail, setSignedUpEmail] = useState<string | null>(null);

  // 招待のプレビュー（グループ名・有効性・参加済みか）。ログイン済みのときだけ取得する。
  const {
    data: preview,
    isPending: previewLoading,
    isError: previewError,
    refetch: refetchPreview,
  } = useQuery({
    queryKey: ["invitation-preview", token],
    enabled: !!session,
    queryFn: async () => {
      const res = await apiClient.invitations[":token"].$get({ param: { token } });
      if (!res.ok) {
        throw new Error("招待の確認に失敗しました");
      }
      return res.json();
    },
  });

  // サインアップ直後（仮登録）はセッションが無いまま確認メール案内を出す。isPending 判定より前に出す。
  if (signedUpEmail) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <div className="flex flex-col items-center gap-1">
          <span className="kicker">Invitation</span>
          <h1 className="headline">グループへの招待</h1>
        </div>
        <VerificationSentNotice email={signedUpEmail} onBack={() => setSignedUpEmail(null)} />
      </main>
    );
  }

  if (isPending) {
    return <SessionPending />;
  }

  // メンバーは全員アカウント必須。未ログインならサインイン/サインアップへ誘導する。
  // 認証が通るとセッションが更新され、このページが参加確認の表示に切り替わる。
  // 招待リンクの主な流入はアカウント未保有の新規ユーザーのため、サインアップを初期表示にする。
  if (!session) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <div className="flex flex-col items-center gap-1">
          <span className="kicker">Invitation</span>
          <h1 className="headline">グループへの招待</h1>
        </div>
        <p className="note-muted">参加するにはサインアップまたはサインインしてください。</p>
        <AuthPanel defaultMode="signUp" onSignedUp={setSignedUpEmail} />
      </main>
    );
  }

  async function handleJoin() {
    setError(null);
    setBusy(true);
    try {
      const res = await apiClient.invitations[":token"].accept.$post({ param: { token } });
      if (!res.ok) {
        throw new Error("参加に失敗しました。リンクが無効か期限切れの可能性があります。");
      }
      const { groupId } = await res.json();
      // この画面では ["groups"] のオブザーバが居ない（非アクティブ）ため、refetchType: "all" で
      // その場で再取得まで済ませる。ルート（/）が古い件数でクイック入力を出し分けるのを防ぐ。
      await queryClient.invalidateQueries({ queryKey: ["groups"], refetchType: "all" });
      router.push(`/groups/${groupId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "参加に失敗しました");
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-1">
        <span className="kicker">Invitation</span>
        <h1 className="headline">グループへの招待</h1>
      </div>

      {previewLoading && <p className="note-muted">招待を確認中…</p>}

      {previewError && (
        <div className="flex flex-col items-center gap-3">
          <p className="note-danger">招待の確認中にエラーが発生しました。</p>
          <button type="button" onClick={() => refetchPreview()} className="btn btn-line">
            再試行
          </button>
        </div>
      )}

      {preview && !preview.valid && (
        <div className="flex flex-col items-center gap-3">
          <p>この招待リンクは無効か、有効期限が切れています。</p>
          <Link href="/groups" className="btn btn-line">
            グループ一覧へ
          </Link>
        </div>
      )}

      {preview?.valid && preview.alreadyMember && (
        <div className="flex flex-col items-center gap-3">
          <p>
            あなたは既に「<span className="font-bold">{preview.groupName}</span>」のメンバーです。
          </p>
          <Link href={`/groups/${preview.groupId}`} className="btn btn-line">
            グループへ
          </Link>
        </div>
      )}

      {preview?.valid && !preview.alreadyMember && (
        <div className="flex flex-col items-center gap-3">
          <p>
            「<span className="font-bold">{preview.groupName}</span>」に招待されています。
          </p>
          {error && <p className="note-danger">{error}</p>}
          <button type="button" disabled={busy} onClick={handleJoin} className="btn btn-fill">
            参加する
          </button>
        </div>
      )}
    </main>
  );
}
