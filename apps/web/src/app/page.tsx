"use client";

import Link from "next/link";
import { SessionPending } from "@/components/session-states";
import { signOut, useSession } from "@/lib/auth-client";
import { AuthPanel } from "./auth-panel";

export default function Home() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <SessionPending />;
  }

  // 未ログイン: サインアップ/サインインフォームを中心に表示する。
  // SignInPrompt がトップページをサインイン先として誘導しているため、この導線は維持する。
  if (!session) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <h1 className="text-2xl font-semibold">warikan</h1>
        <AuthPanel />
      </main>
    );
  }

  // ログイン済み: アプリ本来の導線（グループ・アカウント設定）を前面に出す。
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">warikan</h1>
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
      <button type="button" onClick={() => signOut()} className="text-sm text-zinc-500 underline">
        サインアウト
      </button>
    </main>
  );
}
