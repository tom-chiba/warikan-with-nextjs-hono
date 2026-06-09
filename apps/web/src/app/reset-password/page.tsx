"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { passwordRuleErrorMessage } from "@/lib/auth-error";

// メール内リンクの遷移先（#68）。API がトークンを検証したのち、
// 有効なら ?token=、無効・期限切れなら ?error=INVALID_TOKEN を付けてここへリダイレクトする。
// useSearchParams は Suspense 境界を要求するため、内側を境界で包む。
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-xs flex-1 flex-col justify-center gap-6 px-5 py-6">
      <div className="flex flex-col gap-1">
        <span className="kicker">Reset password</span>
        <h1 className="headline">パスワード再設定</h1>
      </div>
      {children}
    </main>
  );
}

function ResetPasswordFallback() {
  return (
    <ResetPasswordShell>
      <p className="note-muted">読み込み中…</p>
    </ResetPasswordShell>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  // API は無効・期限切れトークンを ?error=INVALID_TOKEN で返す。token 欠落も同様に扱う。
  const linkInvalid = searchParams.get("error") === "INVALID_TOKEN" || !token;

  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await authClient.resetPassword({ newPassword, token });
      if (res.error) {
        // INVALID_TOKEN はこの画面固有。長さ規則は change-password と共通のため共有ヘルパーに委ねる。
        setError(
          res.error.code === "INVALID_TOKEN"
            ? "リンクが無効か期限切れです。お手数ですが再度パスワード再設定をお試しください。"
            : (passwordRuleErrorMessage(res.error.code) ??
                res.error.message ??
                "パスワードの再設定に失敗しました"),
        );
        return;
      }
      setDone(true);
    } catch {
      // ネットワーク断等で fetch 自体が reject するケース。HTTP エラーは res.error で返る。
      setError("パスワードの再設定に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  // 無効・期限切れリンク。再申請へ誘導する。
  if (linkInvalid) {
    return (
      <ResetPasswordShell>
        <p className="note-danger">
          このリンクは無効か期限切れです。お手数ですが、もう一度パスワード再設定をお試しください。
        </p>
        <Link href="/forgot-password" className="btn btn-fill">
          パスワード再設定をやり直す
        </Link>
      </ResetPasswordShell>
    );
  }

  // 再設定完了。再設定では自動サインインしないため、サインイン画面へ誘導する。
  if (done) {
    return (
      <ResetPasswordShell>
        <p className="note-ok">
          パスワードを再設定しました。新しいパスワードでサインインできます。
        </p>
        <button type="button" onClick={() => router.push("/")} className="btn btn-fill">
          サインインへ
        </button>
      </ResetPasswordShell>
    );
  }

  return (
    <ResetPasswordShell>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <p className="note-muted">新しいパスワードを入力してください。</p>
        <input
          type="password"
          aria-label="新しいパスワード"
          placeholder="新しいパスワード（8文字以上）"
          autoComplete="new-password"
          required
          autoFocus
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="field"
        />
        {error && <p className="note-danger">{error}</p>}
        <button
          type="submit"
          // プレースホルダで案内している既定の最小長（8 文字）に達するまで無効化する。
          // サーバー側の PASSWORD_TOO_SHORT 表示は防御として残す。
          disabled={submitting || newPassword.length < 8}
          className="btn btn-fill"
        >
          パスワードを再設定
        </button>
      </form>
    </ResetPasswordShell>
  );
}
