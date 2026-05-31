import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { getUserId, signUpAndGetCookie } from "../helpers/auth-session";

const BASE = env.BETTER_AUTH_URL;

// group_member に所属行を直接 INSERT するヘルパー（テスト用のセットアップ）。
// Drizzle の timestamp mode は秒単位で読み書きするため、生 SQL でも秒で挿入する
//（Date.now() のミリ秒を直接入れると Drizzle 経由の読み出しがずれる）。
async function joinGroup(groupId: string, userId: string, role = "member") {
  const nowSec = Math.floor(Date.now() / 1000);
  await env.DB.prepare("INSERT INTO `group` (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .bind(groupId, "Trip", nowSec, nowSec)
    .run();
  await env.DB.prepare(
    "INSERT INTO group_member (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)",
  )
    .bind(groupId, userId, role, nowSec)
    .run();
}

describe("保護ルート /groups/:groupId", () => {
  it("メンバーのリクエストは通過し group コンテキストを参照できる", async () => {
    const cookie = await signUpAndGetCookie("member@example.com");
    const userId = await getUserId(env.DB, "member@example.com");
    await joinGroup("group-pass", userId, "owner");

    const res = await SELF.fetch(`${BASE}/groups/group-pass/members`, {
      headers: { cookie },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ groupId: "group-pass", role: "owner" });
  });
});
