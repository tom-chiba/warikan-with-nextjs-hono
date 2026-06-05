import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq, notExists } from "drizzle-orm";
import { createDb } from "./db";
import * as schema from "./db/schema";
import { group, groupMember } from "./db/schema";

// D1 バインディングや secret は実行時 env から渡るため、
// auth インスタンスはシングルトンにせずリクエストごとに生成する。
export function createAuth(env: Env) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    // ブラウザは別オリジン(dev: localhost:3000)から認証を呼ぶため、CSRF 用に信頼する。
    // 本番は WEB_ORIGIN（カンマ区切りで複数可）で差し替える。
    trustedOrigins: (env.WEB_ORIGIN ?? "http://localhost:3000").split(","),
    database: drizzleAdapter(createDb(env.DB), {
      provider: "sqlite",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
    },
    user: {
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
            const db = createDb(env.DB);
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
