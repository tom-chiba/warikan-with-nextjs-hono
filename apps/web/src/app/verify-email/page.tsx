"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";
import { sendVerificationEmail, verifyEmailCallbackURL } from "@/lib/auth-client";

// 確認メール内リンクの遷移先（#69）。API がトークンを検証したのち、ここへリダイレクトする。
// 検証成功時は autoSignInAfterVerification によりセッションが張られた状態で（クエリなしで）着地し、
// 期限切れ・無効トークンのときは ?error=TOKEN_EXPIRED / ?error=INVALID_TOKEN を付けて戻る。
// useSearchParams は Suspense 境界を要求するため、内側を境界で包む。
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailFallback />}>
      <VerifyEmailView />
    </Suspense>
  );
}

function VerifyEmailShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-xs flex-1 flex-col justify-center gap-6 px-5 py-6">
      <div className="flex flex-col gap-1">
        <span className="kicker">Verify email</span>
        <h1 className="headline">メールアドレスの確認</h1>
      </div>
      {children}
    </main>
  );
}

function VerifyEmailFallback() {
  return (
    <VerifyEmailShell>
      <p className="note-muted">読み込み中…</p>
    </VerifyEmailShell>
  );
}

function VerifyEmailView() {
  const searchParams = useSearchParams();
  // API は期限切れ・無効トークンを ?error=TOKEN_EXPIRED / ?error=INVALID_TOKEN で返す。
  const linkInvalid = searchParams.get("error") !== null;

  // 無効・期限切れリンク。確認メールの再送に誘導する。
  if (linkInvalid) {
    return (
      <VerifyEmailShell>
        <p className="note-danger">
          このリンクは無効か期限切れです。お手数ですが、確認メールを再送してリンクを踏み直してください。
        </p>
        <ResendForm />
      </VerifyEmailShell>
    );
  }

  // 検証成功。autoSignInAfterVerification により、通常はここに着いた時点でサインイン済みなので
  // 「アプリへ」でそのまま入れる（未サインインなら / がサインイン画面を出す）。
  // セッション状態で文言を分岐すると SSR とクライアントで描画が食い違いハイドレーションエラーに
  // なるため、文言・導線はセッションに依存させない。
  return (
    <VerifyEmailShell>
      <p className="note-ok">メールアドレスの確認が完了しました。</p>
      <Link href="/" className="btn btn-fill">
        アプリへ
      </Link>
    </VerifyEmailShell>
  );
}

// 確認メールの再送フォーム。期限切れ・無効リンクからの復帰導線（受け入れ条件: 再送につなげる）。
// 列挙対策として forgot-password と同じく、成否にかかわらず中立の完了表示にする。
function ResendForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await sendVerificationEmail({ email: email.trim(), callbackURL: verifyEmailCallbackURL() });
    } catch {
      // ネットワーク断等。中立表示を保つため握りつぶす。
    }
    setSent(true);
    setSubmitting(false);
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <p className="note-ok">
          入力されたメールアドレスが未確認の場合、確認メールを再送しました。メールをご確認ください。
        </p>
        <Link href="/" className="link-quiet self-start">
          サインインへ戻る
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="note-muted">
        登録したメールアドレスを入力してください。確認メールを再送します。
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
      <button
        type="submit"
        disabled={submitting || email.trim().length === 0}
        className="btn btn-fill"
      >
        確認メールを再送
      </button>
      <Link href="/" className="link-quiet self-start">
        サインインへ戻る
      </Link>
    </form>
  );
}
