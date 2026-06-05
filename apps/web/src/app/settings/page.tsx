"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { SessionPending, SignInPrompt } from "@/components/session-states";
import { authClient, useSession } from "@/lib/auth-client";

// アカウント設定ページ。アカウント情報の表示と、危険操作ゾーン（アカウント削除）を置く。
// 削除は Better Auth の deleteUser（パスワード再入力方式）で行い、本人確認を伴う（#33）。
export default function SettingsPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isPending) return <SessionPending />;
  if (!session) return <SignInPrompt message="設定を利用するにはサインインが必要です。" />;

  async function handleDelete(e: FormEvent) {
    e.preventDefault();
    if (
      !window.confirm(
        "アカウントを削除します。あなただけが参加しているグループと、各グループでのあなたの支払・負担記録も削除されます。この操作は取り消せません。よろしいですか？",
      )
    ) {
      return;
    }
    setError(null);
    setSubmitting(true);
    const res = await authClient.deleteUser({ password });
    if (res.error) {
      setError(res.error.message ?? "アカウントの削除に失敗しました");
      setSubmitting(false);
      return;
    }
    // 削除成功時はセッションも無効化済みのため、ホーム（サインイン画面）へ戻す。
    router.push("/");
  }

  return (
    <main className="flex flex-1 flex-col items-center gap-8 p-8">
      <h1 className="text-2xl font-semibold">アカウント設定</h1>

      <section className="flex w-full max-w-xs flex-col gap-2">
        <h2 className="text-lg font-medium">アカウント情報</h2>
        <p className="text-sm">
          名前: <span className="font-mono">{session.user.name}</span>
        </p>
        <p className="text-sm">
          メール: <span className="font-mono">{session.user.email}</span>
        </p>
      </section>

      <section className="flex w-full max-w-xs flex-col gap-3 rounded-lg border border-red-300 p-4 dark:border-red-900">
        <h2 className="text-lg font-medium text-red-600 dark:text-red-400">危険な操作</h2>
        <p className="text-sm text-zinc-500">
          アカウントを削除（退会）します。あなただけが参加しているグループは削除され、他のメンバーが残るグループでもあなたの支払・負担記録は削除されます。この操作は取り消せません。
        </p>
        <form onSubmit={handleDelete} className="flex flex-col gap-3">
          <input
            type="password"
            aria-label="確認用パスワード"
            placeholder="パスワードを入力して確認"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border px-3 py-2"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={submitting || password.length === 0}
            className="rounded-md bg-red-600 px-4 py-2 text-white disabled:opacity-50"
          >
            アカウントを削除
          </button>
        </form>
      </section>
    </main>
  );
}
