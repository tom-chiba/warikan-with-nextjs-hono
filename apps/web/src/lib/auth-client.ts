import { createAuthClient } from "better-auth/react";

// Better Auth のクライアント。baseURL は api のオリジンを指す
// （認証エンドポイントは baseURL + /api/auth/*）。
const baseURL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

export const authClient = createAuthClient({ baseURL });

export const { useSession, signIn, signUp, signOut, sendVerificationEmail } = authClient;

// メール検証リンク踏破後の着地先（#69）。検証メールの url は
// ${API}/api/auth/verify-email?token=...&callbackURL=<ここ> の形になり、検証後この /verify-email に
// 着地して成功・失敗を表示する。サインアップ・サインイン・再送・メール変更で同じ値を使うため、
// パスのハードコードをここに一元化する（クライアント実行時のみ呼ぶこと。window 参照のため）。
export function verifyEmailCallbackURL(): string {
  return `${window.location.origin}/verify-email`;
}
