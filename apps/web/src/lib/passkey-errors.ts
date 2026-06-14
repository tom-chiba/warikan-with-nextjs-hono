// パスキー（#90）の UX 分岐で参照する WebAuthn エラーコード。
//
// 注意: @better-auth/passkey のクライアントは WebAuthn セレモニーが失敗したとき、
// @simplewebauthn/browser の WebAuthnError の「生コード」（"ERROR_*"）を error.code に載せて返す。
// PASSKEY_ERROR_CODES（AUTH_CANCELLED 等）の名前は error.message 側にしか使われないため、
// code を判定するときは下記の生コードと比較すること（名前と比較すると常に不一致になる）。
// 参照: @better-auth/passkey/dist/client.mjs の signIn.passkey / addPasskey の catch 節。

// ユーザーがダイアログを閉じた／タイムアウト等でセレモニーが中断された（NotAllowedError 相当）。
// 登録・認証のどちらのキャンセルもこのコードで返る。
export const WEBAUTHN_CEREMONY_ABORTED = "ERROR_CEREMONY_ABORTED";

// 同一アカウントの認証器に既に credential があり、再登録しようとした。
export const WEBAUTHN_PREVIOUSLY_REGISTERED = "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED";

// セッションの鮮度（freshAge、既定 24h）切れ。passkey の登録系エンドポイントは
// registration.requireSession により freshSessionMiddleware が付き、session.createdAt が
// freshAge を超えた古いセッションを 403 で弾く（code: "SESSION_NOT_FRESH" / #105）。
// この場合 addPasskey は generate-register-options の 403 を error にそのまま載せて返す
// （OS ダイアログ前に return する）。長命セッション運用ではログイン済みユーザーがほぼ確実に
// 該当するため、これを検知してパスワード再認証フローへ誘導する。
// 注意: これは WebAuthn の生コードではなく Better Auth 本体のエラーコード。
export const SESSION_NOT_FRESH = "SESSION_NOT_FRESH";
