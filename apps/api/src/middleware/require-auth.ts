import type { MiddlewareHandler } from "hono";
import type { AuthVariables } from "../context";
import { createAuth } from "../auth";

// ログイン済みであることを Better Auth のセッション検証で確認する。
// 未ログインなら 401 を返し、通過時は user / session をコンテキストに格納する。
// 後続のオプション拡張（roles 指定など）を見越して factory 形式で公開する。
export const requireAuth = (): MiddlewareHandler<{
  Bindings: Env;
  Variables: AuthVariables;
}> => {
  return async (c, next) => {
    const result = await createAuth(c.env).api.getSession({
      headers: c.req.raw.headers,
    });
    if (!result) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    c.set("session", result.session);
    c.set("user", result.user);
    await next();
  };
};
