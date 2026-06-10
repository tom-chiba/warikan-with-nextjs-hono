import { escapeHtmlAttribute } from "./html";
import type { MailMessage } from "./index";

// パスワード再設定メールの文面（#68）。送信トリガーは auth.ts の sendResetPassword から呼ぶ。
// 将来のメール検証（#69）も同じ email/ 配下にテンプレートを置く想定。
//
// url は Better Auth が生成した API の確認リンク
//（${BETTER_AUTH_URL}/api/auth/reset-password/:token?callbackURL=<web の /reset-password>）。
// これを踏むと API がトークンを検証し、Web の /reset-password へ ?token= 付きでリダイレクトする。
export function buildResetPasswordEmail({ to, url }: { to: string; url: string }): MailMessage {
  // サービス名は test-email.ts の件名と同じく "warikan"。API 側に共有定数は無いため直書きする。
  const subject = "【warikan】パスワード再設定のご案内";
  const text = [
    "パスワード再設定のリクエストを受け付けました。",
    "以下のリンクから新しいパスワードを設定してください（リンクの有効期限は約1時間です）。",
    "",
    url,
    "",
    "このメールに心当たりがない場合は、何もせずに破棄してください。パスワードは変更されません。",
  ].join("\n");
  const html = [
    "<p>パスワード再設定のリクエストを受け付けました。</p>",
    "<p>以下のリンクから新しいパスワードを設定してください（リンクの有効期限は約1時間です）。</p>",
    `<p><a href="${escapeHtmlAttribute(url)}">パスワードを再設定する</a></p>`,
    "<p>このメールに心当たりがない場合は、何もせずに破棄してください。パスワードは変更されません。</p>",
  ].join("");
  return { to, subject, text, html };
}
