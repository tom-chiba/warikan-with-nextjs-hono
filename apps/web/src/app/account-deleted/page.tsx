import Link from "next/link";

// アカウント削除確認リンク踏破後の着地ページ（#78）。確認メールの url は
// ${API}/api/auth/delete-user/callback?token=...&callbackURL=<ここ> の形で、API がトークンを検証し
// 削除（孤児グループ掃除を含む afterDelete）を実行したのち、ここへリダイレクトする。
// この時点でセッションは破棄済みのため、未サインイン状態で着地する。期限切れ・無効トークンの
// ときは API がリダイレクトせずエラーを返す（削除も実行されない）ため、ここには着地しない。
// セッション状態で文言を分岐するとハイドレーションエラーになるため、表示はセッションに依存させない。
export default function AccountDeletedPage() {
  return (
    <main className="mx-auto flex w-full max-w-xs flex-1 flex-col justify-center gap-6 px-5 py-6">
      <div className="flex flex-col gap-1">
        <span className="kicker">Account deleted</span>
        <h1 className="headline">アカウント削除</h1>
      </div>
      <p className="note-ok">アカウントを削除しました。ご利用ありがとうございました。</p>
      <Link href="/" className="btn btn-fill">
        ホームへ
      </Link>
    </main>
  );
}
