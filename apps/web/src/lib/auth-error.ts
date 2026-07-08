// 認証まわりのユーザー向け文言を一元化し、画面間の文言ドリフトを防ぐ。

// 401（セッション切れ）時に表示する共通文言。購入品の保存・更新やグループ作成など、
// 認証が必要な操作の失敗時に複数画面で参照する（文言をここに集約してドリフトを防ぐ）。
export const SESSION_EXPIRED_MESSAGE = "セッションが切れました。再度サインインしてください。";

// Better Auth 本体のエラーメッセージは英語のため、UI で起きうるものはコードから日本語にマップする。
// パスワードの長さ規則（最小8・最大128）は change-password / reset-password の両画面で共通のため、
// コードと長さの対応をここに一元化して文言のドリフトを防ぐ（#61 / #68）。
// 画面ごとに主語が異なる（「新しいパスワード」/「パスワード」）ため label で差し替える。
export function passwordRuleErrorMessage(
  code: string | undefined,
  label = "パスワード",
): string | null {
  switch (code) {
    case "PASSWORD_TOO_SHORT":
      return `${label}は8文字以上で入力してください`;
    case "PASSWORD_TOO_LONG":
      return `${label}は128文字以内で入力してください`;
    default:
      return null;
  }
}
