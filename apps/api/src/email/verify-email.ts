import { escapeHtmlAttribute } from "./html";
import type { MailMessage } from "./index";

// メールアドレス確認メールの文面（#69 / #77）。送信トリガーは auth.ts の
// emailVerification.sendVerificationEmail で、サインアップ時の確認（#69）と
// メールアドレス変更時の新アドレス宛確認（#77）の両方が同じこのコールバックを通る。
// Better Auth はその 2 経路を区別する手掛かりをコールバックに渡さないため、文面は
// 「アカウント登録」「サインインできるようになります」等の signup 限定の文言を避け、
// どちらの文脈でも自然に読める中立表現にしてある。reset-password-email.ts と同形。
//
// url は Better Auth が生成した API の確認リンク
//（${BETTER_AUTH_URL}/api/auth/verify-email?token=<JWT>&callbackURL=<web の /verify-email>）。
// これを踏むと API がトークンを検証し emailVerified を立て、Web の /verify-email へリダイレクトする。
export function buildVerificationEmail({ to, url }: { to: string; url: string }): MailMessage {
  // サービス名は reset-password-email.ts の件名と同じく "warikan"。API 側に共有定数は無いため直書きする。
  const subject = "【warikan】メールアドレス確認のご案内";
  const text = [
    "以下のリンクをクリックして、メールアドレスの確認を完了してください（リンクの有効期限は約1時間です）。",
    "",
    url,
    "",
    "このメールに心当たりがない場合は、何もせずに破棄してください。",
  ].join("\n");
  const html = [
    "<p>以下のリンクをクリックして、メールアドレスの確認を完了してください（リンクの有効期限は約1時間です）。</p>",
    `<p><a href="${escapeHtmlAttribute(url)}">メールアドレスを確認する</a></p>`,
    "<p>このメールに心当たりがない場合は、何もせずに破棄してください。</p>",
  ].join("");
  return { to, subject, text, html };
}
