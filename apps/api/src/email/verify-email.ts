import type { MailMessage } from "./index";

// HTML 属性値（href）への埋め込み用の最小エスケープ。reset-password-email.ts と同じ理由で、
// 将来クエリパラメータが増えて & が入っても属性が壊れない・属性インジェクションされないよう、
// コメントの不変条件に頼らず境界で構造的にエスケープする。
function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

// サインアップ時のメールアドレス確認メールの文面（#69）。送信トリガーは auth.ts の
// emailVerification.sendVerificationEmail から呼ぶ。reset-password-email.ts と同形。
//
// url は Better Auth が生成した API の確認リンク
//（${BETTER_AUTH_URL}/api/auth/verify-email?token=<JWT>&callbackURL=<web の /verify-email>）。
// これを踏むと API がトークンを検証し emailVerified を立て、Web の /verify-email へリダイレクトする。
export function buildVerificationEmail({ to, url }: { to: string; url: string }): MailMessage {
  // サービス名は reset-password-email.ts の件名と同じく "warikan"。API 側に共有定数は無いため直書きする。
  const subject = "【warikan】メールアドレス確認のご案内";
  const text = [
    "アカウント登録のお手続きありがとうございます。",
    "以下のリンクをクリックして、メールアドレスの確認を完了してください（リンクの有効期限は約1時間です）。",
    "",
    url,
    "",
    "確認が完了するとサインインできるようになります。",
    "このメールに心当たりがない場合は、何もせずに破棄してください。",
  ].join("\n");
  const html = [
    "<p>アカウント登録のお手続きありがとうございます。</p>",
    "<p>以下のリンクをクリックして、メールアドレスの確認を完了してください（リンクの有効期限は約1時間です）。</p>",
    `<p><a href="${escapeHtmlAttribute(url)}">メールアドレスを確認する</a></p>`,
    "<p>確認が完了するとサインインできるようになります。</p>",
    "<p>このメールに心当たりがない場合は、何もせずに破棄してください。</p>",
  ].join("");
  return { to, subject, text, html };
}
