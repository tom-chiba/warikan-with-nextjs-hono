import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { signUpAndGetCookie } from "../helpers/auth-session";

const BASE = env.BETTER_AUTH_URL;

// 保護ルート（/groups/:groupId/members）に対する認可ガードの挙動を検証する。
describe("認可ミドルウェア (requireAuth / requireGroupMember)", () => {
  it("未ログインのリクエストは 401 を返す", async () => {
    const res = await SELF.fetch(`${BASE}/groups/any-group/members`);
    expect(res.status).toBe(401);
  });

  it("グループ非メンバーのリクエストは 403 を返す", async () => {
    const cookie = await signUpAndGetCookie("outsider@example.com");

    // どのグループにも所属していないユーザーがアクセスする。
    const res = await SELF.fetch(`${BASE}/groups/group-not-joined/members`, {
      headers: { cookie },
    });

    expect(res.status).toBe(403);
  });
});
