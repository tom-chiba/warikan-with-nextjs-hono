import { sendViaResend } from "./resend";
import { recordSentEmail } from "./test-inbox";

// アプリ全体が依存するのはこの薄い抽象だけにする。Resend など送信サービス固有の型は
// email/ 配下に閉じ込め、呼び出し側（#68 のパスワード再設定 / #69 のメール検証など）には
// 漏らさない。これにより送信サービスを差し替えても呼び出し側は無変更で済む。
// html / text は少なくとも一方が必須。Resend は両方任意だが本文ゼロは送れないため、
// 呼び出し側（#68 / #69）が両方省略するとコンパイルエラーになるよう型で強制する。
type EmailContent = { html: string; text?: string } | { html?: string; text: string };

export type EmailMessage = {
  to: string;
  subject: string;
} & EmailContent;

// createDb(env.DB) と同じく、API キー等は実行時 env から渡るため
// リクエストごとに env から生成して使う。
export type EmailSender = (message: EmailMessage) => Promise<void>;

// env からメール送信関数を組み立てる。
// - RESEND_API_KEY があれば Resend で実送信する（本番）。
// - なければ console 出力にフォールバックする（ローカル開発・テスト。実送信しない）。
// - EMAIL_TEST_INBOX === "1" のときは、どちらのバックエンドでも送信内容をインメモリ受信箱に
//   記録し、テスト（vitest / e2e）が /__test__/emails 経由で宛先・リンク URL を検証できるようにする。
//   本番 wrangler.jsonc には EMAIL_TEST_INBOX を置かないため、受信箱は本番では無効。
export function createEmailSender(env: Env): EmailSender {
  const captureToInbox = env.EMAIL_TEST_INBOX === "1";
  const from = env.RESEND_FROM ?? "no-reply@example.com";

  // 変数に束縛して string に絞り込む（三項演算子の条件部だけでは then 側へ narrowing が伝播しない）。
  const apiKey = env.RESEND_API_KEY;
  const backend: EmailSender = apiKey
    ? (message) => sendViaResend(apiKey, from, message)
    : async (message) => {
        // 実送信しないフォールバック。ローカルで送信内容を目視確認できるようにする。
        console.log("[email:console] 実送信せずログ出力します", {
          from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
      };

  if (!captureToInbox) {
    return backend;
  }

  // 受信箱記録は送信「後」に行う。送信が throw したら記録しない（失敗は呼び出し側に伝播）。
  return async (message) => {
    await backend(message);
    recordSentEmail({ from, ...message });
  };
}
