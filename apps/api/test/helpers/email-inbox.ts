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
  // EMAIL_TEST_INBOX 無効化やルート退行で非200が返ると body に emails が無く、
  // 呼び出し側が undefined を読んで分かりにくい TypeError で落ちる。ここで明確に失敗させる。
  if (!res.ok) {
    throw new Error(`受信箱の取得に失敗しました (status ${res.status})`);
  }
  const { emails } = await res.json<{ emails: SentEmail[] }>();
  return emails;
}

// 受信箱をクリアする。テスト間の独立性を保つため beforeEach から呼ぶ。
export function clearEmails(): Promise<Response> {
  return SELF.fetch(`${BASE}/__test__/emails`, { method: "DELETE" });
}

// 受信箱から指定宛先の最新メールを取り出す（listEmails は送信順のため findLast で最新）。
// 宛先は実行ごとに一意のため、クリアしなくても他テストのメールと混ざらない前提で使う。
// verify-email / change-email / delete-user の各テストで共通利用する。
export async function latestEmailTo(to: string): Promise<SentEmail> {
  const mail = (await listEmails()).findLast((e) => e.to === to);
  if (!mail) {
    throw new Error(`${to} 宛のメールが受信箱に無い`);
  }
  return mail;
}
