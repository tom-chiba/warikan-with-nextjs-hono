import { createAuthClient } from "better-auth/react";

// Better Auth のクライアント。baseURL は api のオリジンを指す
// （認証エンドポイントは baseURL + /api/auth/*）。
const baseURL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

export const authClient = createAuthClient({ baseURL });

export const { useSession, signIn, signUp, signOut, sendVerificationEmail } = authClient;
