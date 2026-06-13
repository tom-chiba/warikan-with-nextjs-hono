import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/react";

// パスキー専用の Better Auth クライアント（#90）。
//
// なぜ共有の auth-client.ts と分けるか:
// @better-auth/passkey/client は @simplewebauthn/browser を静的 import する。これを共有 authClient
// （ルート / のセッション取得などアプリ全域で読み込まれる）の plugins に載せると、その重い依存が
// 最高頻度のクイック入力画面の初期バンドルに混入し、CLAUDE.md のパフォーマンス方針に反する。
// そこで passkeyClient はこの独立モジュールに閉じ込め、呼び出し側は動的 import() で
// クリック時にのみ取り込む（= @simplewebauthn/browser は別チャンクに分離され初期表示に乗らない）。
//
// baseURL は共有 authClient と同一（api オリジン）。セッション cookie は同一 api オリジンに対する
// 同一サイト fetch で共有されるため、このクライアントでサインインしてもセッションは共有される。
// ただし useSession を駆動するのは共有 authClient 側の nanostore なので、サインインの成功後は
// 呼び出し側で refreshSession()（auth-client.ts。= 共有クライアントの再取得）を呼ぶこと。
const baseURL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

export const passkeyAuthClient = createAuthClient({
  baseURL,
  plugins: [passkeyClient()],
});
