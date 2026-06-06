"use client";

import Link from "next/link";
import { SessionError, SessionPending } from "@/components/session-states";
import { APP_NAME } from "@/lib/app-meta";
import { signOut, useSession } from "@/lib/auth-client";
import { AuthPanel } from "./auth-panel";

export default function Home() {
  const { data: session, isPending, error, refetch } = useSession();

  if (isPending) {
    return <SessionPending />;
  }

  // セッション取得自体の失敗（API 不達・5xx）は未ログインと区別して再試行を促す。
  if (error) {
    return <SessionError onRetry={() => refetch()} />;
  }

  // ログイン済みならアプリ本来の導線（グループ・アカウント設定）を前面に出す。
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
          <div className="flex flex-col items-center gap-3">
            <Link
              href="/groups"
              className="rounded-md bg-black px-4 py-2 text-white dark:bg-white dark:text-black"
            >
              グループ
            </Link>
            <Link href="/settings" className="rounded-md border px-4 py-2">
              アカウント設定
            </Link>
          </div>
          <button
            type="button"
            onClick={() => signOut()}
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
