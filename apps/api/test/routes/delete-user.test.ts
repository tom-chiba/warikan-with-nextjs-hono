import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { clearEmails, listEmails, type SentEmail } from "../helpers/email-inbox";
import { getUserId, signUpAndGetCookie } from "../helpers/auth-session";
import { addMember, createGroup } from "../helpers/group";

const BASE = env.BETTER_AUTH_URL;

// ブラウザが付与する Origin ヘッダ。Better Auth は cookie 付き POST に origin/referer が
// 無いと CSRF として 403 を返すため、実際のクライアントと同様に origin を明示する。
// 値は BETTER_AUTH_URL と同様 vitest.config.ts の miniflare bindings を単一ソースとする
//（WEB_ORIGIN はカンマ区切りで複数指定できるため先頭を使う）。
const WEB_ORIGIN = env.WEB_ORIGIN.split(",")[0];

// 削除確認リンク踏破後の着地先。Web の /account-deleted（#78）。originCheck の対象になるため
// trustedOrigins（= WEB_ORIGIN）配下にする。
const CALLBACK_URL = `${WEB_ORIGIN}/account-deleted`;

// アカウント削除を「要求」する（#78）。sendDeleteAccountVerification 設定により、即削除ではなく
// 確認メールを送る経路に入る。レスポンスは 200 + { message: "Verification email sent" }。
function requestDelete(cookie: string, callbackURL = CALLBACK_URL) {
  return SELF.fetch(`${BASE}/api/auth/delete-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie, origin: WEB_ORIGIN },
    body: JSON.stringify({ callbackURL }),
  });
}

// 受信箱から指定宛先の最新メールに含まれる削除確認リンク URL を取り出す。
// リンクは ${BASE}/api/auth/delete-user/callback?token=<token>&callbackURL=... の形。
function extractDeleteUrl(email: SentEmail): string {
  const body = email.text ?? email.html ?? "";
  const match = body.match(/https?:\/\/[^\s"]+\/api\/auth\/delete-user\/callback\?[^\s"]+/);
  if (!match) {
    throw new Error(`delete link not found in email body: ${body}`);
  }
  return match[0];
}

async function latestEmailTo(to: string): Promise<SentEmail> {
  const mail = (await listEmails()).findLast((e) => e.to === to);
  if (!mail) {
    throw new Error(`${to} 宛のメールが受信箱に無い`);
  }
  return mail;
}

// 削除確認リンク（GET）を踏む。発行元と同一セッション（cookie）前提で、成功すると
// callbackURL へ 302 リダイレクトする。検証は呼び出し側に任せ、レスポンスを返す。
function followDeleteLink(url: string, cookie: string) {
  return SELF.fetch(url, { headers: { cookie }, redirect: "manual" });
}

// 要求 → 受信箱からリンク取得 → 踏破までの一式。削除が確定したレスポンス（302）を返す。
async function deleteUserViaLink(cookie: string, email: string) {
  const reqRes = await requestDelete(cookie);
  expect(reqRes.status).toBe(200);
  const url = extractDeleteUrl(await latestEmailTo(email));
  return followDeleteLink(url, cookie);
}

async function userExists(userId: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT id FROM user WHERE id = ?").bind(userId).first();
  return row !== null;
}

async function groupExists(groupId: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT id FROM `group` WHERE id = ?").bind(groupId).first();
  return row !== null;
}

describe("アカウント削除（確認メールのリンク方式 / #78）", () => {
  // 受信箱はモジュールスコープで蓄積されるため、テスト間でクリアして独立性を保つ。
  beforeEach(async () => {
    await clearEmails();
  });

  it("削除を要求すると確認メールが届き、リンクを踏むまでは削除されない", async () => {
    const cookie = await signUpAndGetCookie("du-request@example.com");
    const userId = await getUserId(env.DB, "du-request@example.com");

    const res = await requestDelete(cookie);

    expect(res.status).toBe(200);
    const body = await res.json<{ message?: string }>();
    expect(body.message).toBe("Verification email sent");
    // この時点では即削除されない（受け入れ条件）。
    expect(await userExists(userId)).toBe(true);

    const mail = await latestEmailTo("du-request@example.com");
    expect(mail.subject).toContain("アカウント削除");
    expect(extractDeleteUrl(mail)).toBeTruthy();
  });

  it("確認リンクを踏むと user とセッションが消え、callbackURL へ戻る", async () => {
    const cookie = await signUpAndGetCookie("du-basic@example.com");
    const userId = await getUserId(env.DB, "du-basic@example.com");

    const res = await deleteUserViaLink(cookie, "du-basic@example.com");

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(CALLBACK_URL);
    expect(await userExists(userId)).toBe(false);
    const session = await env.DB.prepare("SELECT id FROM session WHERE user_id = ?")
      .bind(userId)
      .first();
    expect(session).toBeNull();
  });

  it("唯一メンバーだったグループは削除される", async () => {
    const cookie = await signUpAndGetCookie("du-solo@example.com");
    const groupId = await createGroup(cookie, "ひとりグループ");

    const res = await deleteUserViaLink(cookie, "du-solo@example.com");

    expect(res.status).toBe(302);
    expect(await groupExists(groupId)).toBe(false);
  });

  it("他メンバーが残るグループは残り、当人の所属記録だけ消える", async () => {
    const ownerCookie = await signUpAndGetCookie("du-owner@example.com");
    await signUpAndGetCookie("du-member@example.com");
    const memberId = await getUserId(env.DB, "du-member@example.com");
    const groupId = await createGroup(ownerCookie, "残るグループ");
    await addMember(groupId, memberId);

    const res = await deleteUserViaLink(ownerCookie, "du-owner@example.com");

    expect(res.status).toBe(302);
    expect(await groupExists(groupId)).toBe(true);
    const members = await env.DB.prepare("SELECT user_id FROM group_member WHERE group_id = ?")
      .bind(groupId)
      .all<{ user_id: string }>();
    expect(members.results.map((m) => m.user_id)).toEqual([memberId]);
  });

  it("ひとりグループと共有グループが混在する場合、ひとりグループだけ消える", async () => {
    const cookie = await signUpAndGetCookie("du-mixed@example.com");
    await signUpAndGetCookie("du-mixed-other@example.com");
    const otherId = await getUserId(env.DB, "du-mixed-other@example.com");
    const soloGroupId = await createGroup(cookie, "ひとり");
    const sharedGroupId = await createGroup(cookie, "ふたり");
    await addMember(sharedGroupId, otherId);

    const res = await deleteUserViaLink(cookie, "du-mixed@example.com");

    expect(res.status).toBe(302);
    expect(await groupExists(soloGroupId)).toBe(false);
    expect(await groupExists(sharedGroupId)).toBe(true);
  });

  it("残るグループでも当人の支払・負担記録は CASCADE で消える（#33 の留意点）", async () => {
    const ownerCookie = await signUpAndGetCookie("du-cascade@example.com");
    await signUpAndGetCookie("du-cascade-member@example.com");
    const ownerId = await getUserId(env.DB, "du-cascade@example.com");
    const memberId = await getUserId(env.DB, "du-cascade-member@example.com");
    const groupId = await createGroup(ownerCookie, "精算データあり");
    await addMember(groupId, memberId);
    // owner が支払い、2 人で割勘した item をテスト用に直接 INSERT する。
    const itemId = crypto.randomUUID();
    const nowSec = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      "INSERT INTO item (id, group_id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(itemId, groupId, "食材", "unsettled", nowSec, nowSec)
      .run();
    await env.DB.prepare("INSERT INTO item_payment (item_id, user_id, amount) VALUES (?, ?, ?)")
      .bind(itemId, ownerId, 1000)
      .run();
    await env.DB.prepare(
      "INSERT INTO item_share (item_id, user_id, amount) VALUES (?, ?, ?), (?, ?, ?)",
    )
      .bind(itemId, ownerId, 500, itemId, memberId, 500)
      .run();

    const res = await deleteUserViaLink(ownerCookie, "du-cascade@example.com");

    expect(res.status).toBe(302);
    // item 自体は残るが、削除した owner の支払・負担行は消える（残メンバーの負担行は残る）。
    const item = await env.DB.prepare("SELECT id FROM item WHERE id = ?").bind(itemId).first();
    expect(item).not.toBeNull();
    const payments = await env.DB.prepare("SELECT user_id FROM item_payment WHERE item_id = ?")
      .bind(itemId)
      .all();
    expect(payments.results).toEqual([]);
    const shares = await env.DB.prepare("SELECT user_id FROM item_share WHERE item_id = ?")
      .bind(itemId)
      .all<{ user_id: string }>();
    expect(shares.results.map((s) => s.user_id)).toEqual([memberId]);
  });

  it("無効なトークンのリンクでは削除されない", async () => {
    const cookie = await signUpAndGetCookie("du-invalid-token@example.com");
    const userId = await getUserId(env.DB, "du-invalid-token@example.com");
    // 確認メールを送らせたうえで、明らかに無効なトークンで踏む。
    await requestDelete(cookie);

    const res = await followDeleteLink(
      `${BASE}/api/auth/delete-user/callback?token=obviously-invalid&callbackURL=${encodeURIComponent(CALLBACK_URL)}`,
      cookie,
    );

    // 無効トークンはリダイレクトせず NOT_FOUND を返し、削除も実行されない（受け入れ条件）。
    expect(res.status).toBe(404);
    expect(await userExists(userId)).toBe(true);
  });

  it("未ログインのままリンクを踏んでも削除されない", async () => {
    const cookie = await signUpAndGetCookie("du-no-session@example.com");
    const userId = await getUserId(env.DB, "du-no-session@example.com");
    await requestDelete(cookie);
    const url = extractDeleteUrl(await latestEmailTo("du-no-session@example.com"));

    // cookie を付けずに踏む。コールバックはセッション必須のため削除されない。
    const res = await SELF.fetch(url, { redirect: "manual" });

    expect(res.status).not.toBe(302);
    expect(await userExists(userId)).toBe(true);
  });

  it("未ログインでは削除を要求できない（401）", async () => {
    const res = await SELF.fetch(`${BASE}/api/auth/delete-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: WEB_ORIGIN },
      body: JSON.stringify({ callbackURL: CALLBACK_URL }),
    });
    expect(res.status).toBe(401);
  });
});
