import type { MailMessage } from "./index";

// テスト用のインメモリ受信箱。EMAIL_TEST_INBOX === "1" のときだけ createEmailSender が
// ここに送信内容を記録し、/__test__/emails 経由で取り出せるようにする（本番では未使用）。
//
// e2e では api が別プロセスの wrangler dev で動くため、Playwright はプロセス内メモリを
// 直接読めない。そこで HTTP エンドポイント経由で取り出せるよう、モジュールスコープに保持する。
// wrangler dev / Miniflare は同一プロセス内で 1 つの worker インスタンスを使い回すため、
// この store は同一プロセス内の後続リクエストから参照できる。

export type SentEmail = MailMessage & { from: string };

// 送信順に蓄積する。クリアは /__test__/emails の DELETE か clearSentEmails() で行う。
const sentEmails: SentEmail[] = [];

export function recordSentEmail(email: SentEmail): void {
  sentEmails.push(email);
}

// 記録済みメールの一覧。新しいものほど後ろ。
export function listSentEmails(): readonly SentEmail[] {
  return sentEmails;
}

export function clearSentEmails(): void {
  sentEmails.length = 0;
}
