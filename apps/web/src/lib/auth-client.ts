import { createAuthClient } from "better-auth/react";

// Better Auth のクライアント。baseURL は api のオリジンを指す
// （認証エンドポイントは baseURL + /api/auth/*）。
const baseURL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

export const authClient = createAuthClient({ baseURL });

export const { useSession, signIn, signUp, signOut, sendVerificationEmail } = authClient;

// パスキー（#90）は別クライアント（passkey-client.ts）でサインイン/登録する。セッション cookie は
// 同一 api オリジンで共有されるが、useSession を駆動するのはこの共有クライアントの nanostore のため、
// パスキー操作の成功後にこれを呼んでセッションを能動的に再取得させ、UI（useResolvedSession ／
// SessionCacheBoundary）へ反映する。$sessionSignal を反転させると useSession の購読が再フェッチする。
export function refreshSession(): void {
  authClient.$store.notify("$sessionSignal");
}

// メール検証リンク踏破後の着地先（#69）。検証メールの url は
// ${API}/api/auth/verify-email?token=...&callbackURL=<ここ> の形になり、検証後この /verify-email に
// 着地して成功・失敗を表示する。サインアップ・サインイン・再送・メール変更で同じ値を使うため、
// パスのハードコードをここに一元化する（クライアント実行時のみ呼ぶこと。window 参照のため）。
export function verifyEmailCallbackURL(): string {
  return `${window.location.origin}/verify-email`;
}

// アカウント削除確認リンク踏破後の着地先（#78）。確認メールの url は
// ${API}/api/auth/delete-user/callback?token=...&callbackURL=<ここ> の形になり、API が削除を実行した
// のちこの /account-deleted に着地して完了表示する（クライアント実行時のみ呼ぶこと。window 参照のため）。
export function deleteAccountCallbackURL(): string {
  return `${window.location.origin}/account-deleted`;
}
