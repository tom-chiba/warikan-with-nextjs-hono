import { escapeHtmlAttribute } from "./html";
import type { MailMessage } from "./index";

// アカウント削除（退会）確認メールの文面（#78）。送信トリガーは auth.ts の
// deleteUser.sendDeleteAccountVerification で、#33 のパスワード即削除に代えて確認リンク方式に
// する。誤操作やセッション乗っ取り時の即時削除を防ぐのが目的。reset-password-email.ts と同形。
//
// url は Better Auth が生成した API の確認リンク
//（${BETTER_AUTH_URL}/api/auth/delete-user/callback?token=<token>&callbackURL=<web の /account-deleted>）。
// これを踏むと API がトークンを検証してアカウントを削除し、Web の /account-deleted へリダイレクトする。
// リンクは「削除をリクエストした本人のセッション」前提のため、文面で同じブラウザで開くよう促す。
export function buildDeleteAccountEmail({ to, url }: { to: string; url: string }): MailMessage {
  // サービス名は reset-password-email.ts の件名と同じく "warikan"。API 側に共有定数は無いため直書きする。
  const subject = "【warikan】アカウント削除（退会）の確認";
  const text = [
    "アカウント削除（退会）のリクエストを受け付けました。",
    "以下のリンクを、リクエストした端末と同じブラウザで開くと削除が完了します（リンクの有効期限は約1時間です）。",
    "削除すると、あなただけが参加しているグループと、各グループでのあなたの支払・負担記録も削除されます。この操作は取り消せません。",
    "",
    url,
    "",
    "このメールに心当たりがない場合は、何もせずに破棄してください。アカウントは削除されません。",
  ].join("\n");
  const html = [
    "<p>アカウント削除（退会）のリクエストを受け付けました。</p>",
    "<p>以下のリンクを、リクエストした端末と同じブラウザで開くと削除が完了します（リンクの有効期限は約1時間です）。</p>",
    "<p>削除すると、あなただけが参加しているグループと、各グループでのあなたの支払・負担記録も削除されます。この操作は取り消せません。</p>",
    `<p><a href="${escapeHtmlAttribute(url)}">アカウントを削除する</a></p>`,
    "<p>このメールに心当たりがない場合は、何もせずに破棄してください。アカウントは削除されません。</p>",
  ].join("");
  return { to, subject, text, html };
}
