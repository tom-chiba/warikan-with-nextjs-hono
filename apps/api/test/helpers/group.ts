import { env, SELF } from "cloudflare:test";

const BASE = env.BETTER_AUTH_URL;

// API 経由でグループを作成し（作成者が owner メンバーになる）、id を返すテストヘルパー。
export async function createGroup(cookie: string, name = "旅行"): Promise<string> {
  const res = await SELF.fetch(`${BASE}/groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ name }),
  });
  return ((await res.json()) as { id: string }).id;
}

// 既存グループに member を直接 INSERT するテストヘルパー（参加フローを介さずに追加する）。
export async function addMember(groupId: string, userId: string, role = "member") {
  const nowSec = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT INTO group_member (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)",
  )
    .bind(groupId, userId, role, nowSec)
    .run();
}
