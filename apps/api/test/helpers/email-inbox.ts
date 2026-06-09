import { env, SELF } from "cloudflare:test";
import type { SentEmail } from "../../src/email/test-inbox";

// テスト用インメモリ受信箱（#70）への共通アクセス。test-email・reset-password の双方が
// /__test__/emails を叩いて宛先・件名・リンク URL を検証するため、ここに一元化する。
// 型は送信基盤（src/email/test-inbox.ts）の SentEmail を単一ソースとして再利用する。
export type { SentEmail };

const BASE = env.BETTER_AUTH_URL;

// 受信箱に記録された送信メール一覧を取得する。
export async function listEmails(): Promise<SentEmail[]> {
  const res = await SELF.fetch(`${BASE}/__test__/emails`);
  const { emails } = await res.json<{ emails: SentEmail[] }>();
  return emails;
}

// 受信箱をクリアする。テスト間の独立性を保つため beforeEach から呼ぶ。
export function clearEmails(): Promise<Response> {
  return SELF.fetch(`${BASE}/__test__/emails`, { method: "DELETE" });
}
