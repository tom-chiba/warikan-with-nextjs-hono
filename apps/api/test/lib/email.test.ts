import { describe, expect, it } from "vitest";
import { createEmailSender, type MailMessage } from "../../src/email";

// Workers/D1 に依存しない純粋ロジックのため unit プロジェクト（node 環境）で実行する。
// Env はテスト都合で必要なキーだけ与える。
function envOf(overrides: Partial<Record<keyof Env, string>>): Env {
  return overrides as unknown as Env;
}

describe("createEmailSender（#70）", () => {
  it("RESEND_API_KEY ありで RESEND_FROM が無いと生成時に throw する（設定漏れを fail-fast）", () => {
    expect(() => createEmailSender(envOf({ RESEND_API_KEY: "re_test" }))).toThrow(/RESEND_FROM/);
  });

  it("RESEND_API_KEY ありでも RESEND_FROM があれば生成できる", () => {
    expect(() =>
      createEmailSender(envOf({ RESEND_API_KEY: "re_test", RESEND_FROM: "no-reply@example.com" })),
    ).not.toThrow();
  });

  it("RESEND_API_KEY なし（console フォールバック）なら RESEND_FROM 無しでも生成できる", () => {
    expect(() => createEmailSender(envOf({}))).not.toThrow();
  });

  it("EMAIL_TEST_INBOX=1 なら RESEND_API_KEY があっても実送信せず（RESEND_FROM 不要で）生成できる", () => {
    // 受信箱有効時は実 Resend を選ばないため、RESEND_FROM 欠如でも throw しない（console 経路）。
    // これによりテスト/e2e は実 Resend のレート制限・失敗に左右されず受信箱記録に到達する（#69）。
    expect(() =>
      createEmailSender(envOf({ RESEND_API_KEY: "re_test", EMAIL_TEST_INBOX: "1" })),
    ).not.toThrow();
  });

  it("html / text がどちらも無いと送信時に throw する", async () => {
    const send = createEmailSender(envOf({}));
    await expect(send({ to: "a@example.com", subject: "件名" } as MailMessage)).rejects.toThrow(
      /本文/,
    );
  });

  it("空文字の html だけ（text 無し）も本文ゼロ扱いで throw する", async () => {
    const send = createEmailSender(envOf({}));
    await expect(
      send({ to: "a@example.com", subject: "件名", html: "" } as MailMessage),
    ).rejects.toThrow(/本文/);
  });

  it("text があれば console フォールバックで送信でき throw しない", async () => {
    const send = createEmailSender(envOf({}));
    await expect(
      send({ to: "a@example.com", subject: "件名", text: "本文" }),
    ).resolves.toBeUndefined();
  });
});
