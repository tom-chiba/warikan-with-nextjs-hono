"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

// パスワード再設定の要求ページ（#68）。メールアドレスを入力すると再設定リンクを送る。
// 未ログインで到達するため、セッションガードは設けない。
//
// メールアドレス列挙対策: Better Auth の requestPasswordReset は登録の有無にかかわらず
// status:true を返す。ここでも成功時は「登録されていれば送信しました」という中立表示にし、
// 入力したメールが登録済みかどうかを画面から判別できないようにする。
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // redirectTo はメール内リンクを踏んだあとの遷移先（このアプリの /reset-password）。
      // API がトークンを検証し、?token= または ?error=INVALID_TOKEN を付けてここへ戻す。
      const res = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (res.error) {
        // ここでのエラーはネットワーク断やサーバー障害など、メールの存在有無に依存しないもの。
        setError(res.error.message ?? "送信に失敗しました。時間をおいて再度お試しください。");
        return;
      }
      setSent(true);
    } catch {
      setError("送信に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-xs flex-1 flex-col justify-center gap-6 px-5 py-6">
      <div className="flex flex-col gap-1">
        <span className="kicker">Reset password</span>
        <h1 className="headline">パスワード再設定</h1>
      </div>

      {sent ? (
        <div className="flex flex-col gap-4">
          <p className="note-ok">
            入力されたメールアドレスが登録されている場合、パスワード再設定用のリンクを送信しました。メールをご確認ください。
          </p>
          <p className="note-muted">
            メールが届かない場合は、迷惑メールフォルダをご確認のうえ、メールアドレスを確かめて再度お試しください。
          </p>
          <Link href="/" className="link-quiet self-start">
            サインインへ戻る
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <p className="note-muted">
            登録したメールアドレスを入力してください。パスワード再設定用のリンクをお送りします。
          </p>
          <input
            type="email"
            aria-label="メールアドレス"
            placeholder="メールアドレス"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field"
          />
          {error && <p className="note-danger">{error}</p>}
          <button
            type="submit"
            disabled={submitting || email.trim().length === 0}
            className="btn btn-fill"
          >
            再設定リンクを送信
          </button>
          <Link href="/" className="link-quiet self-start">
            サインインへ戻る
          </Link>
        </form>
      )}
    </main>
  );
}
