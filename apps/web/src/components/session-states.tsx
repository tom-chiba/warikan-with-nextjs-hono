import Link from "next/link";

// セッション確認中・未ログイン時の共通フォールバック表示。
// 各ページの useSession ガード（isPending / !session）で繰り返し使われる画面を共通化する。

export function SessionPending() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <p className="text-zinc-500">セッション確認中…</p>
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
      <Link href="/" className="rounded-md border px-4 py-2">
        サインインへ
      </Link>
    </main>
  );
}
