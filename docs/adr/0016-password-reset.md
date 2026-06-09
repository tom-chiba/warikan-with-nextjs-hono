---
status: accepted
date: 2026-06-09
deciders: tom-chiba
---

# パスワード再設定（Better Auth + メール送信基盤）の採用

## Context and Problem Statement

パスワードを忘れたユーザーはサインインできず、復旧手段が無かった（#68）。メールアドレス宛に
再設定リンクを送り、自分でパスワードを再設定できるフローを追加する。前提となるメール送信基盤は
#70（ADR-0015）で整備済みのため、本 ADR はそれを使った再設定フローの設計判断を記録する。

## Decision Drivers

- Better Auth 標準のパスワード再設定フローに素直に乗ること（独自実装を増やさない）
- メールアドレス列挙対策（登録の有無で応答・表示を変えない）。#61 の `/change-email` と同じ考慮
- 「忘れた／漏えいを疑う」文脈に合ったセッションの扱い
- ローカル・CI・e2e で実送信せず、送信内容（リンク URL）を検証できること
- 購入品入力など日常動線のバンドル・初期表示に影響を与えないこと

## Considered Options

- 送信トリガー: **Better Auth の `emailAndPassword.sendResetPassword`** / 独自エンドポイント
- 送信失敗時: **`sendResetPassword` 内で握りつぶしログのみ** / 例外を投げて呼び出し側へ伝播
- 再設定完了時のセッション: **全失効（`revokeSessionsOnPasswordReset: true`）** / 維持
- 完了後の遷移: **サインイン画面へ誘導（手動サインイン）** / 自動サインイン
- メール文面: **text + 簡易 HTML** / text のみ

## Decision Outcome

選んだ選択肢:

- **`sendResetPassword` を実装**し、`/request-password-reset`・`/reset-password` を有効化する。
  コールバック内で `createEmailSender(env)`（ADR-0015）に再設定リンク url を載せて呼ぶだけ。
- **送信失敗時は `sendResetPassword` 内で try/catch し再スローしない**（ログのみ）。
  これは ADR-0015 が「失敗時の方針は #68 に委ねる」とした判断点。`/request-password-reset` は
  未登録メールでは `sendResetPassword` を呼ばずに 200 を返すため、送信失敗で再スローすると
  「登録済みだけ 500・未登録は 200」となりメールアドレスの存在有無が漏れる。列挙対策のため
  応答を常に同一にする。
- **`revokeSessionsOnPasswordReset: true`**。再設定は「忘れた／漏えいを疑う」文脈であり、
  既存セッション（他端末含む）を残さない方が安全。`change-password` の `revokeOtherSessions: true`
  （#61）と同じ思想。再設定は自動サインインしないため、結果として全セッションが失効する。
- **完了後はサインイン画面（`/`）へ誘導**し、新パスワードで手動サインインさせる。Better Auth の
  reset-password は自動サインインしないため標準挙動に沿う。
- **メール文面は text + 簡易 HTML の両方**を載せる（`email/reset-password-email.ts`）。

UI は #61 の各フォームと同じ独自パターン（`useState` + `note-danger`/`note-ok`/`field`/`btn`）で、
`/forgot-password`（要求）と `/reset-password`（設定）を追加する。`/reset-password` は API が
返す `?token=`／`?error=INVALID_TOKEN` を `useSearchParams`（Suspense 境界）で受け取り、
無効・期限切れ時は再申請へ誘導する。要求側は登録の有無にかかわらず中立メッセージを表示する。
トークンの有効期限は Better Auth 既定の 1 時間を採用する（`resetPasswordTokenExpiresIn` 未指定）。

### Consequences

- 良い点:
  - Better Auth の標準フローに乗るため実装が薄く、列挙対策・タイミング攻撃対策も本体に委ねられる。
  - 失敗を握りつぶすことで応答が常に同一になり、列挙対策（受け入れ条件）を UI/API 双方で満たす。
  - 全セッション失効により、漏えい時でも旧セッションが残らない。
- 悪い点 / トレードオフ:
  - 送信失敗をユーザーに通知しない（中立表示のまま）。再送は本人の再操作に委ねる。
  - vitest は wrangler 設定経由で `.dev.vars` を読み込むため、開発者が実 `RESEND_API_KEY` を
    入れていると実送信に走り受信箱が空になる。テスト bindings で空文字に上書きして console
    フォールバックに固定した（`apps/api/vitest.config.ts`）。ローカル e2e も同様の理由で、
    `.dev.vars` の `RESEND_API_KEY` は空（既定）にしておく必要がある。

## More Information

- メール内リンクは `${BETTER_AUTH_URL}/api/auth/reset-password/:token?callbackURL=<web の /reset-password>`。
  踏むと API がトークンを検証し、Web の `/reset-password` へ `?token=` または `?error=INVALID_TOKEN`
  を付けてリダイレクトする。
- スコープ外: メール検証（#69）、メールアドレス変更の確認メール化（#61 の `updateEmailWithoutVerification`
  見直し）。これらは将来 `emailVerification.sendVerificationEmail` 導入時に合わせて検討する。
