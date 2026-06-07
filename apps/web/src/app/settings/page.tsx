"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { SessionPending, SignInPrompt } from "@/components/session-states";
import { authClient, signOut, useSession } from "@/lib/auth-client";

// 設定ハブページ。日常動線から外したグループ管理への入り口と、アカウント情報・
// サインアウト・危険操作ゾーン（アカウント削除）をここに集約する（#51）。
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
    try {
      const res = await authClient.deleteUser({ password });
      if (res.error) {
        // Better Auth 本体のエラーメッセージは英語のため、UI で起きうる誤パスワードは
        // コードから日本語にマップする。自前の hooks.before は日本語 message をそのまま使う。
        setError(
          res.error.code === "INVALID_PASSWORD"
            ? "パスワードが正しくありません"
            : (res.error.message ?? "アカウントの削除に失敗しました"),
        );
        return;
      }
      // 削除成功時はセッションも無効化済みのため、ホーム（サインイン画面）へ戻す。
      router.push("/");
    } catch {
      // ネットワーク断等で fetch 自体が reject するケース。HTTP エラーは res.error で返る。
      setError("アカウントの削除に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    // サインアウト後は未ログインのホーム（サインイン画面）へ戻す。
    // クエリキャッシュの破棄は SessionCacheBoundary がセッション変化を検知して行う。
    await signOut();
    router.push("/");
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-5 py-6">
      <div className="flex flex-col gap-1">
        <span className="kicker">Settings</span>
        <h1 className="headline">設定</h1>
      </div>

      <section className="flex w-full flex-col gap-3">
        <h2 className="section-title section-rule">グループ管理</h2>
        <p className="note-muted">グループの作成・メンバーの招待や退出はこちらから行えます。</p>
        <Link href="/groups" className="btn btn-line self-start">
          グループ管理へ
        </Link>
      </section>

      <section className="flex w-full flex-col gap-2">
        <h2 className="section-title section-rule">アカウント情報</h2>
        <p className="text-sm">
          名前: <span className="font-bold">{session.user.name}</span>
        </p>
        <p className="text-sm">
          メール: <span className="font-mono text-xs">{session.user.email}</span>
        </p>
        <button type="button" onClick={handleSignOut} className="link-quiet mt-1 self-start">
          サインアウト
        </button>
      </section>

      <section className="flex w-full flex-col gap-3 border-2 border-danger p-4">
        <h2 className="section-title border-b-2 border-danger pb-1.5 text-danger">危険な操作</h2>
        <p className="note-muted">
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
            className="field"
          />
          {error && <p className="note-danger">{error}</p>}
          <button
            type="submit"
            disabled={submitting || password.length === 0}
            className="btn btn-fill-danger"
          >
            アカウントを削除
          </button>
        </form>
      </section>

      <Link href="/" className="link-quiet self-start">
        ホームへ戻る
      </Link>
    </main>
  );
}
