import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { eq, notExists } from "drizzle-orm";
import { createDb } from "./db";
import * as schema from "./db/schema";
import { group, groupMember, user } from "./db/schema";
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
      // テスト時のみ scrypt を SHA-256 に差し替えてテストを高速化する(#42 / ADR-0012)。
      // TEST_HASH は vitest.config.ts の miniflare.bindings でのみ注入され、
      // 本番 wrangler.jsonc には存在しないため常に undefined = scrypt のまま。
      // "0" や "false" の誤設定で有効化されないよう truthy 判定ではなく "1" と厳密比較する。
      ...(env.TEST_HASH === "1" ? { password: testPasswordHasher } : {}),
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
          const session = await getSessionFromCtx(ctx);
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
      // メールアドレス変更（#61）。メール送信基盤が未整備のため確認メール方式は採れず、
      // updateEmailWithoutVerification で即時変更する。これは現メールが未検証
      //（emailVerified !== true）の場合のみ働くが、本アプリはメール検証自体が無く
      // 全ユーザーが未検証のため、実質すべてのユーザーが即時変更となる。
      // 将来メール検証を導入する際は emailVerification.sendVerificationEmail の実装と
      // このオプションの見直しが必要（#61 の実装方針メモ参照）。
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
