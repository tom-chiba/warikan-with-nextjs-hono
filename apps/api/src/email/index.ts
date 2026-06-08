import { sendViaResend } from "./resend";
import { recordSentEmail } from "./test-inbox";

// アプリ全体が依存するのはこの薄い抽象だけにする。Resend など送信サービス固有の型は
// email/ 配下に閉じ込め、呼び出し側（#68 のパスワード再設定 / #69 のメール検証など）には
// 漏らさない。これにより送信サービスを差し替えても呼び出し側は無変更で済む。
// html / text は少なくとも一方が必須。Resend は両方任意だが本文ゼロは送れないため、
// 両方省略するとコンパイルエラーになるよう型で強制する（空文字は型を通るので実行時にも確認する）。
type EmailContent = { html: string; text?: string } | { html?: string; text: string };

// 型名は Workers ランタイムのグローバル ambient 型 `EmailMessage`（Email Workers 用、from/to/raw を持つ
// 別物）との衝突を避けるため `MailMessage` にする。同名だと import を書き忘れた呼び出し側が
// コンパイルエラーにならずグローバル型へ静かに解決されてしまう。
export type MailMessage = {
  to: string;
  subject: string;
} & EmailContent;

// createDb(env.DB) と同じく、API キー等は実行時 env から渡るため
// リクエストごとに env から生成して使う。
export type EmailSender = (message: MailMessage) => Promise<void>;

// env からメール送信関数を組み立てる。
// - RESEND_API_KEY があれば Resend で実送信する（本番）。
// - なければ console 出力にフォールバックする（ローカル開発・テスト。実送信しない）。
// - EMAIL_TEST_INBOX === "1" のときは、どちらのバックエンドでも送信内容をインメモリ受信箱に
//   記録し、テスト（vitest / e2e）が /__test__/emails 経由で宛先・リンク URL を検証できるようにする。
//   本番 wrangler.jsonc には EMAIL_TEST_INBOX を置かないため、受信箱は本番では無効。
export function createEmailSender(env: Env): EmailSender {
  const captureToInbox = env.EMAIL_TEST_INBOX === "1";
  const apiKey = env.RESEND_API_KEY;

  let from: string;
  let backend: EmailSender;
  if (apiKey) {
    // 実送信時は送信元が必須。未設定のまま example.com 等にフォールバックすると、Resend が
    // 未検証ドメインとして全送信を拒否し本番障害になる。設定漏れはここで即座に検知する。
    if (!env.RESEND_FROM) {
      throw new Error("RESEND_FROM is required when RESEND_API_KEY is set");
    }
    from = env.RESEND_FROM;
    backend = (message) => sendViaResend(apiKey, from, message);
  } else {
    // 実送信しないフォールバック。送信元は表示用の既定値で良い（実際には送られない）。
    from = env.RESEND_FROM ?? "no-reply@example.com";
    backend = async (message) => {
      // ローカルで送信内容を目視確認できるようにする。
      console.log("[email:console] 実送信せずログ出力します", {
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    };
  }

  return async (message) => {
    // 型は html / text の最低一方必須を強制するが、空文字は型を通り抜ける。本文ゼロのまま送ると
    // Resend が 422 を返すため、呼び出し側（#68 / #69）が気づきやすいエラーで早期に弾く。
    if (!message.html && !message.text) {
      throw new Error("メール本文が空です（html か text の少なくとも一方に内容が必要です）");
    }
    await backend(message);
    // 受信箱記録は送信「後」に行う。送信が throw したら記録しない（失敗は呼び出し側に伝播）。
    if (captureToInbox) {
      recordSentEmail({ from, ...message });
    }
  };
}
