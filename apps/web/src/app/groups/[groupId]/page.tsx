"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";

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
  const { data: inviteData } = useQuery({
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
  const { data: membersData } = useQuery({
    queryKey: ["members", groupId],
    enabled: !!session,
    queryFn: async () => {
      const res = await apiClient.groups[":groupId"].members.$get({ param: { groupId } });
      if (!res.ok) {
        throw new Error("メンバー一覧の取得に失敗しました");
      }
      return res.json();
    },
  });

  if (isPending) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <p className="text-zinc-500">セッション確認中…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <p>このページを利用するにはサインインが必要です。</p>
        <Link href="/" className="rounded-md border px-4 py-2">
          サインインへ
        </Link>
      </main>
    );
  }

  const invitation = inviteData?.invitation ?? null;
  const inviteUrl =
    invitation && typeof window !== "undefined"
      ? `${window.location.origin}/invite/${invitation.token}`
      : null;

  const members = membersData?.members ?? [];
  const currentUserId = session.user.id;
  const isOwner = members.some((m) => m.userId === currentUserId && m.role === "owner");

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
        await queryClient.invalidateQueries({ queryKey: ["groups"] });
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
    <main className="flex flex-1 flex-col items-center gap-8 p-8">
      <h1 className="text-2xl font-semibold">グループ</h1>
      <p className="text-sm text-zinc-500">
        グループ ID: <span className="font-mono">{groupId}</span>
      </p>

      {/* 招待リンク・メンバー操作の双方のエラーをここに集約表示する。 */}
      {error && <p className="w-full max-w-md text-sm text-red-500">{error}</p>}

      <section className="flex w-full max-w-md flex-col gap-3">
        <h2 className="text-lg font-medium">招待リンク</h2>
        {inviteUrl ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-zinc-500">
              このリンクを共有するとメンバーを招待できます（有効期限あり）。
            </p>
            <code className="break-all rounded-md border bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900">
              {inviteUrl}
            </code>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleCopy(inviteUrl)}
                className="rounded-md border px-4 py-2"
              >
                {copied ? "コピーしました" : "コピー"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => invitation && handleRevoke(invitation.token)}
                className="rounded-md border px-4 py-2 text-red-600 disabled:opacity-50"
              >
                無効化
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleGenerate}
                className="rounded-md border px-4 py-2 disabled:opacity-50"
              >
                再発行
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={handleGenerate}
            className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            招待リンクを発行
          </button>
        )}
      </section>

      <section className="flex w-full max-w-md flex-col gap-3">
        <h2 className="text-lg font-medium">メンバー</h2>
        {members.length === 0 ? (
          <p className="text-sm text-zinc-500">読み込み中…</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {members.map((m) => {
              const isSelf = m.userId === currentUserId;
              const canRemove = isSelf || isOwner;
              return (
                <li
                  key={m.userId}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <span className="flex flex-col">
                    <span>
                      {m.name}
                      {isSelf && <span className="text-xs text-zinc-500">（あなた）</span>}
                    </span>
                    <span className="text-xs text-zinc-500">{m.email}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">
                      {m.role === "owner" ? "オーナー" : "メンバー"}
                    </span>
                    {canRemove && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRemove(m.userId, isSelf, m.name)}
                        className="rounded-md border px-3 py-1 text-sm text-red-600 disabled:opacity-50"
                      >
                        {isSelf ? "退出" : "削除"}
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Link href="/groups" className="rounded-md border px-4 py-2">
        グループ一覧へ
      </Link>
    </main>
  );
}
