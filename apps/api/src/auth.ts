import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { eq, notExists } from "drizzle-orm";
import { createDb } from "./db";
import * as schema from "./db/schema";
import { group, groupMember, user } from "./db/schema";
import { createEmailSender } from "./email";
import { buildResetPasswordEmail } from "./email/reset-password-email";
import { buildVerificationEmail } from "./email/verify-email";
import { testPasswordHasher } from "./internal/test-password-hasher";

// D1 バインディングや secret は実行時 env から渡るため、
// auth インスタンスはシングルトンにせずリクエストごとに生成する。
export function createAuth(env: Env) {
  // adapter と afterDelete で同じリクエストスコープの Drizzle インスタンスを共有する。
  const db = createDb(env.DB);
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    // ブラウザは別オリジン(dev: localhost:3000)から認証を呼ぶため、CSRF 用に信頼する。
    // 本番は WEB_ORIGIN（カンマ区切りで複数可）で差し替える。
    trustedOrigins: (env.WEB_ORIGIN ?? "http://localhost:3000").split(","),
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      // サインアップ時にメールアドレスの確認（検証）を必須にする（#69）。有効時、未検証ユーザーの
      // サインインは 403（EMAIL_NOT_VERIFIED）で弾かれ、emailVerification.sendOnSignIn により
      // 確認メールが自動再送される。Web 側はこの 403 を「確認メールを再送しました」表示につなげる。
      // 既存ユーザーは全員 emailVerified=false のため、これを単純に有効化するとロックアウトされる。
      // drizzle/0007_backfill_email_verified.sql で既存ユーザーを検証済みにバックフィルしている。
      requireEmailVerification: true,
      // パスワード再設定の完了時、そのユーザーの全セッション（他端末含む）を失効させる（#68）。
      // 再設定は「パスワードを忘れた／漏えいを疑う」文脈であり、change-password の
      // revokeOtherSessions: true（#61）と同じく既存セッションを残さない方が安全。
      revokeSessionsOnPasswordReset: true,
      // パスワード再設定メールの送信（#68）。createEmailSender(env) で得た送信関数に
      // 再設定リンク url を載せて呼ぶだけ（ADR-0015 / ADR-0016）。
      // ここで例外を外へ漏らさないこと（列挙対策）。request-password-reset は未登録メールでは
      // sendResetPassword を呼ばずに 200 を返すため、送信失敗が応答に影響すると
      // 「登録済みだけエラー・未登録は 200」となりメールアドレスの存在有無が漏れる。
      // Better Auth 本体も sendResetPassword を runInBackgroundOrAwait 経由で呼び、例外を
      // ログのみで握りつぶす（v1.6 時点）ため二重の防御になるが、その内部実装に依存せず
      // 自前でも try/catch して応答を常に同一に保ち、ログも自前の文言で残す。
      sendResetPassword: async ({ user: targetUser, url }) => {
        try {
          const sendEmail = createEmailSender(env);
          await sendEmail(buildResetPasswordEmail({ to: targetUser.email, url }));
        } catch (err) {
          console.error("パスワード再設定メールの送信に失敗しました", err);
        }
      },
      // テスト時のみ scrypt を SHA-256 に差し替えてテストを高速化する(#42 / ADR-0012)。
      // TEST_HASH は vitest.config.ts の miniflare.bindings でのみ注入され、
      // 本番 wrangler.jsonc には存在しないため常に undefined = scrypt のまま。
      // "0" や "false" の誤設定で有効化されないよう truthy 判定ではなく "1" と厳密比較する。
      ...(env.TEST_HASH === "1" ? { password: testPasswordHasher } : {}),
    },
    // サインアップ時のメールアドレス検証（#69）。requireEmailVerification: true と組み合わせ、
    // 確認リンクを踏むまでサインインできない仮登録フローを実現する。
    emailVerification: {
      // 確認メールの送信。sendResetPassword（#68）と同じく createEmailSender(env) で得た送信関数に
      // 検証リンク url を載せて呼ぶ。ここで例外を外へ漏らさないこと: sendOnSignIn の再送は未検証
      // ユーザーのサインイン（403）に付随して走るため、送信失敗が応答へ伝播すると 403 が 500 に化け、
      // メール存在有無による応答差にもつながりうる。Better Auth 本体も送信を try/catch するが、
      // sendResetPassword と同様に内部実装へ依存せず自前でも握りつぶし、ログを自前の文言で残す。
      sendVerificationEmail: async ({ user: targetUser, url }) => {
        try {
          const sendEmail = createEmailSender(env);
          await sendEmail(buildVerificationEmail({ to: targetUser.email, url }));
        } catch (err) {
          console.error("メールアドレス確認メールの送信に失敗しました", err);
        }
      },
      // サインアップ時に確認メールを自動送信する。
      sendOnSignUp: true,
      // 未検証ユーザーがサインインを試みるたびに確認メールを再送する。Web 側は 403 を受けて
      // 「確認メールを再送しました」と案内でき、ユーザーは明示操作なしでも再送を受け取れる。
      sendOnSignIn: true,
      // 確認リンク踏破時にそのまま自動サインインさせ、ユーザーがアプリに入れるようにする。
      // Web の /verify-email はこの自動サインイン済みセッション前提で完了表示する。
      autoSignInAfterVerification: true,
    },
    hooks: {
      // Better Auth の /delete-user はパスワード未指定（空文字含む）だと fresh session
      //（既定 24 時間以内に発行されたセッション）であれば削除を許可するフォールバックを持つ。
      // 本人確認は「パスワード再入力で即削除」（#33 / ADR-0011）のため、UI 任せにせず
      // サーバー側でもパスワード必須を強制する。
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/delete-user" && !ctx.body?.password) {
          throw new APIError("BAD_REQUEST", { message: "パスワードを入力してください" });
        }
        // Better Auth の既定では name は存在チェックのみで、空文字・空白のみでも通る。
        // user.name は notNull かつメンバー一覧等にそのまま表示されるため（#60）、
        // クライアントの required だけに頼らずサーバー側でも空でないことを強制する。
        if (ctx.path === "/sign-up/email") {
          const name = typeof ctx.body?.name === "string" ? ctx.body.name.trim() : "";
          if (!name) {
            throw new APIError("BAD_REQUEST", { message: "名前を入力してください" });
          }
        }
        // Better Auth の /change-email は新メールが既存ユーザーと重複していても、
        // メールアドレス列挙対策として黙って成功（{ status: true }）を返し、変更されない。
        // それでは UI でエラーを示せないため、ここで重複を 400 として明示する（#61）。
        // サインアップが既に USER_ALREADY_EXISTS で存在有無を返すため、認証済みユーザーに
        // とっては新たな情報漏えいにはならない。
        if (ctx.path === "/change-email" && typeof ctx.body?.newEmail === "string") {
          // hooks.before はエンドポイント本体の認証チェックより先に走るため、無条件に
          // 重複を 400 で返すと、未認証でもステータス差（400/401）でメールの存在有無が
          // 判別できてしまう。セッションが無ければ何もせず、本体の 401 に委ねる。
          // disableCookieCache: ここで解決したセッションは ctx.context.session にメモ化され、
          // 本体の sensitiveSessionMiddleware（DB 再検証）がそれを再利用する。将来
          // session.cookieCache を有効化しても失効済みセッションが素通りしないよう、
          // メモ化される値を最初から DB 検証済みにしておく。
          const session = await getSessionFromCtx(ctx, { disableCookieCache: true });
          if (!session) {
            return;
          }
          // Better Auth 本体に合わせて小文字に正規化して比較する。
          const newEmail = ctx.body.newEmail.toLowerCase();
          // 現在のメールと同じ値は「重複」ではなく「変更なし」。ここで重複扱いにすると
          // 紛らわしいため、Better Auth 本体の "Email is the same"（400）に委ねる。
          if (newEmail === session.user.email) {
            return;
          }
          const existing = await db
            .select({ id: user.id })
            .from(user)
            .where(eq(user.email, newEmail))
            .limit(1);
          if (existing.length > 0) {
            throw new APIError("BAD_REQUEST", {
              message: "このメールアドレスはすでに使用されています",
            });
          }
        }
      }),
    },
    user: {
      // メールアドレス変更（#61）。updateEmailWithoutVerification は現メールが未検証
      //（emailVerified !== true）の場合のみ即時変更として働く。
      // #69 でサインアップ時のメール検証を導入したため、今後の新規ユーザーと
      // バックフィル済みの既存ユーザーはすべて emailVerified=true となり、このオプションは
      // 実質無効化される（Better Auth 標準の「新メールへ確認リンク送付」フローに切り替わるが、
      // emailVerification を実装済みの今は確認リンク方式が機能する）。
      // ただし changeEmail を確認メール方式へ正式対応させる（変更先への確認導線・UI 整備）のは
      // #69 のスコープ外で、後続 Issue とする（#69 の実装方針メモ「スコープ外」参照）。
      changeEmail: {
        enabled: true,
        updateEmailWithoutVerification: true,
      },
      // アカウント削除（退会）。パスワード再入力（authClient.deleteUser({ password })）で
      // 本人確認して即削除する。メール送信基盤が未整備のため確認リンク方式は採らない（#33）。
      deleteUser: {
        enabled: true,
        // user 削除後の掃除。group_member は user.id への CASCADE で消えるため、
        // 「唯一メンバーだったグループ」がメンバー 0 人のまま残る。それをここで削除する
        //（メンバー削除 API の「最後の 1 人が抜けたらグループも消す」と同じ NOT EXISTS パターン）。
        // user 削除前に対象を特定する方式（beforeDelete）だと、グループだけ消えて user 削除に
        // 失敗する「データ消失方向」の中間状態がありえるため、削除後の全件掃除を選ぶ。
        // この掃除は冪等で、失敗してもメンバー 0 人のグループが残るだけ（一覧は group_member
        // 起点のため UI に露出しない: ADR-0010）。次回の退会時に自動回収される。
        afterDelete: async () => {
          try {
            await db
              .delete(group)
              .where(
                notExists(db.select().from(groupMember).where(eq(groupMember.groupId, group.id))),
              );
          } catch (err) {
            // user 削除自体は成功済みのため、掃除の失敗で退会リクエストを 500 にしない。
            console.error("孤児グループの掃除に失敗しました", err);
          }
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
