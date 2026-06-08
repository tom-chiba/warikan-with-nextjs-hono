import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { createEmailSender } from "../email";
import { clearSentEmails, listSentEmails } from "../email/test-inbox";

// 動作確認・テスト用のエンドポイント（#70）。EMAIL_TEST_INBOX === "1" のときだけ index.ts が
// マウントする。本番 wrangler.jsonc にはこのフラグを置かないため、本番では露出しない。
// 本番の実送信を一度だけ検証したいときは、`wrangler secret put EMAIL_TEST_INBOX`（値 "1"）で
// 一時的に有効化し、POST /__test__/send で実送信を確認したのち secret を削除して閉じる（DEPLOY.md 参照）。
//
// auth ハンドラと同じく Workers 固有の Bindings(Env) を直接使う。型安全 RPC（AppType）には
// 含めないため Env への依存があってもフロントエンドの型解決に影響しない（ADR-0009）。
export const testEmail = new Hono<{ Bindings: Env }>()
  .post(
    "/send",
    zValidator(
      "json",
      z.object({
        to: z.string().email(),
        subject: z.string().min(1).default("warikan テスト送信"),
        text: z.string().min(1).default("warikan のメール送信基盤からのテスト送信です。"),
      }),
    ),
    async (c) => {
      const { to, subject, text } = c.req.valid("json");
      const sendEmail = createEmailSender(c.env);
      await sendEmail({ to, subject, text });
      return c.json({ ok: true });
    },
  )
  // 記録済みの送信メール一覧を返す。テスト（vitest / e2e）が宛先・リンク URL を検証する。
  .get("/emails", (c) => c.json({ emails: listSentEmails() }))
  // 受信箱をクリアする。テスト間の独立性を保つために使う。
  .delete("/emails", (c) => {
    clearSentEmails();
    return c.json({ ok: true });
  });
