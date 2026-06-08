import type { MailMessage } from "./index";

// Resend の HTTP API を直接叩く薄いラッパ。SDK を依存に加えず fetch のみで実装する
// （Workers のバンドルを軽く保ち、サービス固有型をこのファイルに閉じ込めるため）。
// API 仕様: POST https://api.resend.com/emails（Bearer 認証、from/to/subject 必須、
// html / text の少なくとも一方が必要）。
const RESEND_ENDPOINT = "https://api.resend.com/emails";

// 送信失敗時は throw して呼び出し側（#68 / #69）に方針判断を委ねる（Issue #70 の決定）。
export async function sendViaResend(
  apiKey: string,
  from: string,
  message: MailMessage,
): Promise<void> {
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      // User-Agent が無いと Resend は 403（code 1010）を返すため必ず付与する。
      "User-Agent": "warikan-api",
    },
    body: JSON.stringify({
      from,
      to: message.to,
      subject: message.subject,
      ...(message.html ? { html: message.html } : {}),
      ...(message.text ? { text: message.text } : {}),
    }),
  });

  if (!res.ok) {
    // レスポンス本文にエラー詳細（name / message）が入るため、デバッグ用に含める。
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend send failed: ${res.status} ${detail}`);
  }
}
