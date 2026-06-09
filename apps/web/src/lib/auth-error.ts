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
