import Link from "next/link";

// セッション確認中・未ログイン時の共通フォールバック表示。
// 各ページの useSession ガード（isPending / !session）で繰り返し使われる画面を共通化する。

export function SessionPending() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <p className="note-muted">セッション確認中…</p>
    </main>
  );
}

// セッション取得に失敗したときの表示。再試行は呼び出し側の refetch を受け取る。
export function SessionError({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <p className="note-danger">セッションの確認に失敗しました。</p>
      <button type="button" onClick={onRetry} className="btn btn-line">
        再試行
      </button>
    </main>
  );
}

// 未ログイン時のサインイン導線。文言はページごとに変えられるよう message で差し替え可能。
export function SignInPrompt({
  message = "このページを利用するにはサインインが必要です。",
}: {
  message?: string;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <p>{message}</p>
      <Link href="/" className="btn btn-line">
        サインインへ
      </Link>
    </main>
  );
}
