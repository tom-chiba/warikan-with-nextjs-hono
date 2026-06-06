"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { SessionError, SessionPending } from "@/components/session-states";
import { APP_NAME } from "@/lib/app-meta";
import { signOut, useSession } from "@/lib/auth-client";
import { useGroups } from "@/lib/use-groups";
import { AuthPanel } from "./auth-panel";
import { QuickItemEntry } from "./quick-item-entry";

export default function Home() {
  const { data: session, isPending, error, refetch } = useSession();
  const queryClient = useQueryClient();

  // 所属グループ一覧。ログイン済みのときだけ取得する。
  // フックは early return より前で必ず呼ぶ（React のフック規則）。
  // isPending は enabled: false（未ログイン）でも true になるため、実際に取得中かは isLoading で見る。
  const { data: groupsData, isLoading: groupsLoading, isError: groupsError } = useGroups(!!session);

  if (isPending) {
    return <SessionPending />;
  }

  // セッション取得自体の失敗（API 不達・5xx）は未ログインと区別して再試行を促す。
  if (error) {
    return <SessionError onRetry={() => refetch()} />;
  }

  const groups = groupsData?.groups ?? [];
  const groupsReady = !groupsLoading && !groupsError;

  // ログイン済みなら最頻の操作である購入品入力を最短で出す（#45）。
  // 所属グループが 1 件ならそのままクイック入力、0 件なら作成へ、複数なら選択へ誘導する。
  // 未ログインならサインアップ/サインインフォームを中心に表示する。他ページの
  // SignInPrompt（@/components/session-states）が href="/" でここへ誘導するため、この導線は維持する。
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">{APP_NAME}</h1>
      {session ? (
        <>
          <p>
            ログイン中: <span className="font-mono">{session.user.email}</span>
          </p>
          {groupsLoading && <p className="text-zinc-500">グループを読み込み中…</p>}
          {groupsError && (
            <p className="text-sm text-red-500">グループ一覧の取得に失敗しました。</p>
          )}
          {groupsReady && groups.length === 0 && (
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm text-zinc-500">
                まだグループがありません。グループを作成して購入品の入力を始めましょう。
              </p>
              <Link
                href="/groups"
                className="rounded-md bg-black px-4 py-2 text-white dark:bg-white dark:text-black"
              >
                グループを作成
              </Link>
            </div>
          )}
          {groupsReady && groups.length === 1 && (
            <QuickItemEntry groupId={groups[0].id} groupName={groups[0].name} />
          )}
          {groupsReady && groups.length >= 2 && (
            <Link
              href="/groups"
              className="rounded-md bg-black px-4 py-2 text-white dark:bg-white dark:text-black"
            >
              グループを選んで入力
            </Link>
          )}
          <div className="flex items-center gap-3">
            <Link href="/groups" className="rounded-md border px-4 py-2">
              グループ
            </Link>
            <Link href="/settings" className="rounded-md border px-4 py-2">
              アカウント設定
            </Link>
          </div>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              // 前のユーザーのグループ等が次のサインインで一瞬表示されないよう、キャッシュごと破棄する。
              queryClient.clear();
            }}
            className="text-sm text-zinc-500 underline"
          >
            サインアウト
          </button>
        </>
      ) : (
        <AuthPanel />
      )}
    </main>
  );
}
