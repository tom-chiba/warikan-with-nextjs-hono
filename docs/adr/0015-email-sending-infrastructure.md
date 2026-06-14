---
status: accepted
date: 2026-06-08
deciders: tom-chiba
---

# メール送信基盤（Resend + 薄い抽象 + テスト受信箱）の採用

## Context and Problem Statement

パスワード再設定（#68）・サインアップ時のメール検証（#69）はいずれもメール送信を必要とするが、
これまでメール送信の仕組みが無く、#33（退会の確認リンク）や #61（メールアドレス変更の確認メール）も
この理由で見送ってきた。両機能の前提となるトランザクションメール送信基盤を整備する（#70）。
Cloudflare Workers 上で動くため SMTP は使えず、HTTP API ベースのサービスが必要になる。

## Decision Drivers

- 個人〜小規模の利用規模と運用の手間の少なさ
- `createAuth(env)` / `createDb(env.DB)` のリクエストごと生成パターンとの整合
- サービス固有の型をアプリ側に漏らさない薄い抽象
- ローカル・テストで実送信せず、送信内容（宛先・リンク URL）を検証できること
- e2e（別プロセスの `wrangler dev`）からも送信内容を取り出せること
- API キーをリポジトリに含めないこと

## Considered Options

- 送信サービス: **Resend** / AWS SES / SendGrid・Mailgun
- 実装: Resend SDK / **fetch による薄いラッパ**
- テスト時の取り出し: **dev/test 限定の受信箱 HTTP エンドポイント** / vitest 内インメモリ直接参照のみ / ローカル SMTP（Mailpit 等）
- 送信失敗時: **例外を投げ呼び出し側に委ねる** / 基盤で握りつぶしてログのみ

## Decision Outcome

選んだ選択肢:

- **送信サービスは Resend**。理由は無料枠（100 通/日）・シンプルな HTTP API・Workers 利用実績。
  SES は SigV4 署名が Workers から煩雑。
- **fetch による薄いラッパ**（`src/email/resend.ts`）。SDK を依存に加えず Workers バンドルを軽く保ち、
  サービス固有の型を `email/` 配下に閉じ込める。アプリには `sendEmail({ to, subject, html, text })`
  の抽象（`EmailSender`）だけを公開する。
- **env からの生成**: `createEmailSender(env)` を `createDb(env.DB)` と同じくリクエストごとに env から
  生成する。`RESEND_API_KEY` があれば実送信、無ければ console 出力にフォールバック。
- **送信元は `no-reply@tom-chiba.com`**（当初は `no-reply@warikan.tom-chiba.com`。Resend 無料プランの
  検証済みドメイン1枠を複数の個人開発アプリで共用するため、ルートドメイン `tom-chiba.com` を登録し
  アプリごとにローカルパートで出し分ける方針へ変更）。`RESEND_FROM` を非機密 vars として
  wrangler.jsonc に置き、`RESEND_API_KEY` は機密のため `wrangler secret` で管理する。
- **テスト受信箱**: `EMAIL_TEST_INBOX === "1"` のときだけ、送信内容をモジュールスコープのインメモリ
  受信箱に記録し、`/__test__/*`（`POST /send`・`GET /emails`・`DELETE /emails`）を有効化する。
  vitest は `SELF.fetch`、e2e は Playwright の `request` で同じ経路を使い、宛先・リンク URL を検証できる。
  フラグは `TEST_HASH` と同様 `"1"` との厳密比較で、本番 wrangler.jsonc には置かない。
- **送信失敗時は例外を投げる**。各機能（#68 / #69）が「主要フローを巻き込まない／即エラー」を文脈ごとに
  判断できるよう、基盤では方針を固定しない。

### Consequences

- 良い点:
  - #68 / #69 は `createEmailSender(env)` で得た `sendEmail` を Better Auth のコールバック内で呼ぶだけで実装できる。
  - 送信サービスを差し替えても呼び出し側は無変更（抽象が `email/` に閉じている）。
  - ローカル・CI・e2e で実送信せず送信内容を検証でき、外部サービス障害がテストを不安定にしない。
- 悪い点 / トレードオフ:
  - 受信箱がモジュールスコープのため、複数 isolate に分散する環境では取りこぼしうる。現状は
    Miniflare 単一・`wrangler dev` 単一プロセスを前提とする（テスト用途に限定）。
  - 本番の実送信検証には `/__test__/*` の一時有効化が必要（下記）。
  - fetch ラッパは Resend のレスポンス型を厳密には扱わない（成功/失敗の判定のみ）。

## More Information

- 本番の実送信検証は `EMAIL_TEST_INBOX=1` を一時的に `wrangler secret put` で有効化し、
  `POST /__test__/send` で確認したのち secret を削除して `/__test__/*` を閉じる（docs/DEPLOY.md 参照）。
- 実際のメール文面と送信トリガーは #68 / #69 で実装する。本 ADR は送信基盤までを対象とする。
- 将来メール検証（#69）を導入する際は、auth.ts の `updateEmailWithoutVerification`（#61）と
  `emailVerification.sendVerificationEmail` の整合を見直す。
