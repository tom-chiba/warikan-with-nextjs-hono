import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

const BASE = env.BETTER_AUTH_URL;

function send(body: Record<string, unknown>) {
  return SELF.fetch(`${BASE}/__test__/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function listEmails() {
  return SELF.fetch(`${BASE}/__test__/emails`);
}

interface SentEmail {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

describe("メール送信基盤（#70）", () => {
  // 受信箱はモジュールスコープで蓄積されるため、テスト間でクリアして独立性を保つ。
  beforeEach(async () => {
    await SELF.fetch(`${BASE}/__test__/emails`, { method: "DELETE" });
  });

  it("テスト送信した内容が受信箱に記録され、宛先・件名・本文を取り出せる", async () => {
    const res = await send({
      to: "infra-test@example.com",
      subject: "件名テスト",
      text: "本文テスト https://example.com/verify?token=abc",
    });
    expect(res.status).toBe(200);

    const inbox = await listEmails();
    const { emails } = await inbox.json<{ emails: SentEmail[] }>();
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe("infra-test@example.com");
    expect(emails[0].subject).toBe("件名テスト");
    expect(emails[0].text).toContain("https://example.com/verify?token=abc");
    // RESEND_FROM は wrangler.jsonc の本番値（テスト env には無いため既定値）になる。
    expect(emails[0].from).toBeTruthy();
  });

  it("件名・本文を省略しても既定値で送信できる", async () => {
    const res = await send({ to: "defaults@example.com" });
    expect(res.status).toBe(200);

    const inbox = await listEmails();
    const { emails } = await inbox.json<{ emails: SentEmail[] }>();
    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toBeTruthy();
    expect(emails[0].text).toBeTruthy();
  });

  it("不正なメールアドレスは 400 で弾く", async () => {
    const res = await send({ to: "not-an-email" });
    expect(res.status).toBe(400);

    const inbox = await listEmails();
    const { emails } = await inbox.json<{ emails: SentEmail[] }>();
    expect(emails).toHaveLength(0);
  });

  it("複数送信は送信順に蓄積される", async () => {
    await send({ to: "first@example.com", subject: "1通目" });
    await send({ to: "second@example.com", subject: "2通目" });

    const inbox = await listEmails();
    const { emails } = await inbox.json<{ emails: SentEmail[] }>();
    expect(emails.map((e) => e.to)).toEqual(["first@example.com", "second@example.com"]);
  });
});
