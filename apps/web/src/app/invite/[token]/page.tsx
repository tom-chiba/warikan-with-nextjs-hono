"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { AuthPanel } from "@/app/auth-panel";
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

  if (isPending) {
    return <SessionPending />;
  }

  // メンバーは全員アカウント必須。未ログインならサインイン/サインアップへ誘導する。
  // サインインするとセッションが更新され、このページが参加確認の表示に切り替わる。
  if (!session) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <h1 className="text-2xl font-semibold">グループへの招待</h1>
        <p className="text-sm text-zinc-500">参加するにはサインインしてください。</p>
        <AuthPanel />
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
      <h1 className="text-2xl font-semibold">グループへの招待</h1>

      {previewLoading && <p className="text-zinc-500">招待を確認中…</p>}

      {previewError && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-red-500">招待の確認中にエラーが発生しました。</p>
          <button
            type="button"
            onClick={() => refetchPreview()}
            className="rounded-md border px-4 py-2"
          >
            再試行
          </button>
        </div>
      )}

      {preview && !preview.valid && (
        <div className="flex flex-col items-center gap-3">
          <p>この招待リンクは無効か、有効期限が切れています。</p>
          <Link href="/groups" className="rounded-md border px-4 py-2">
            グループ一覧へ
          </Link>
        </div>
      )}

      {preview?.valid && preview.alreadyMember && (
        <div className="flex flex-col items-center gap-3">
          <p>
            あなたは既に「<span className="font-medium">{preview.groupName}</span>」のメンバーです。
          </p>
          <Link href={`/groups/${preview.groupId}`} className="rounded-md border px-4 py-2">
            グループへ
          </Link>
        </div>
      )}

      {preview?.valid && !preview.alreadyMember && (
        <div className="flex flex-col items-center gap-3">
          <p>
            「<span className="font-medium">{preview.groupName}</span>」に招待されています。
          </p>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={handleJoin}
            className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            参加する
          </button>
        </div>
      )}
    </main>
  );
}
