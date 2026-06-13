"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { SessionPending, SignInPrompt } from "@/components/session-states";
import { authClient, deleteAccountCallbackURL, signOut } from "@/lib/auth-client";
import { useResolvedSession } from "@/lib/use-resolved-session";
import { EmailChangeForm } from "./email-change-form";
import { PasswordChangeForm } from "./password-change-form";

// パスキー管理 UI は @simplewebauthn/browser を含む重い passkey-client に依存するため、
// next/dynamic（ssr:false）で遅延読み込みし、設定画面の初期バンドルから外す（CLAUDE.md の
// パフォーマンス方針）。WebAuthn はクライアント専用 API のため ssr:false が必須。
const PasskeySection = dynamic(() => import("./passkey-section").then((m) => m.PasskeySection), {
  ssr: false,
  loading: () => <p className="note-muted">パスキー設定を読み込み中…</p>,
});

// 設定ハブページ。日常動線から外したグループ管理への入り口と、アカウント情報・
// サインアウト・危険操作ゾーン（アカウント削除）をここに集約する（#51）。
// メールアドレス・パスワードの変更フォームは各コンポーネントに閉じている（#61）。
// 削除は Better Auth の deleteUser（確認メールのリンク方式）で行う。送信後、メール内リンクの
// 踏破で削除が確定する（#78）。
export default function SettingsPage() {
  const { data: session, isPending } = useResolvedSession();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  if (isPending) return <SessionPending />;
  if (!session) return <SignInPrompt message="設定を利用するにはサインインが必要です。" />;

  async function handleRequestDelete(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // #78: パスワード即削除ではなく、確認メールを送る。踏破リンク（/account-deleted 着地）は
      // 発行元と同一セッション前提のため、送信後もサインアウトせずそのまま開いてもらう。
      const res = await authClient.deleteUser({ callbackURL: deleteAccountCallbackURL() });
      if (res.error) {
        setError(res.error.message ?? "確認メールの送信に失敗しました");
        return;
      }
      setSent(true);
    } catch {
      // ネットワーク断等で fetch 自体が reject するケース。HTTP エラーは res.error で返る。
      setError("確認メールの送信に失敗しました");
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
        <EmailChangeForm currentEmail={session.user.email} />
        <PasswordChangeForm />
        <button type="button" onClick={handleSignOut} className="link-quiet mt-1 self-start">
          サインアウト
        </button>
      </section>

      <PasskeySection />

      <section className="flex w-full flex-col gap-3 border-2 border-danger p-4">
        <h2 className="section-title border-b-2 border-danger pb-1.5 text-danger">危険な操作</h2>
        <p className="note-muted">
          アカウントを削除（退会）します。あなただけが参加しているグループは削除され、他のメンバーが残るグループでもあなたの支払・負担記録は削除されます。この操作は取り消せません。
        </p>
        {sent && (
          <p className="note-ok">
            確認メールを送信しました。同じブラウザでメール内のリンクを開くと削除が完了します（リンクの有効期限は約1時間です）。サインアウトせずにお待ちください。
          </p>
        )}
        <form onSubmit={handleRequestDelete} className="flex flex-col gap-3">
          {/* 送信後も再送できるようにする。リンクは約1時間で失効し、メールが届かない場合の
              復帰導線が無いと詰まるため、sent 状態でも案内文を「再送」に切り替えてボタンを残す。 */}
          <p className="note-muted">
            {sent
              ? "メールが届かない場合は、もう一度押すと確認メールを再送できます。"
              : "下のボタンを押すと確認メールを送信します。メール内のリンクを開くまで削除は実行されません。"}
          </p>
          {error && <p className="note-danger">{error}</p>}
          <button type="submit" disabled={submitting} className="btn btn-fill-danger">
            {sent ? "確認メールを再送する" : "アカウント削除の確認メールを送る"}
          </button>
        </form>
      </section>

      <Link href="/" className="link-quiet self-start">
        ホームへ戻る
      </Link>
    </main>
  );
}
