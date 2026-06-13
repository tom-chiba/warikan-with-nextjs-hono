import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { signUpAndGetCookie } from "../helpers/auth-session";
import { clearEmails, listEmails } from "../helpers/email-inbox";

const BASE = env.BETTER_AUTH_URL;

// ブラウザが付与する Origin ヘッダ。Better Auth は cookie 付き POST に origin/referer が
// 無いと CSRF として 403 を返すため、実際のクライアントと同様に origin を明示する。
const WEB_ORIGIN = env.WEB_ORIGIN.split(",")[0];

// Better Auth のメールアドレス変更エンドポイント（#61）。
function changeEmail(cookie: string, newEmail: string) {
  return SELF.fetch(`${BASE}/api/auth/change-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie, origin: WEB_ORIGIN },
    body: JSON.stringify({ newEmail }),
  });
}

// メール変更後にそのメールでサインインできるかの確認用。
function signIn(email: string, password = "password1234") {
  return SELF.fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

async function getDbEmail(originalOrNewEmail: string): Promise<string | null> {
  const row = await env.DB.prepare("SELECT email FROM user WHERE email = ?")
    .bind(originalOrNewEmail)
    .first<{ email: string }>();
  return row?.email ?? null;
}

// 新アドレス宛に届いた確認メールのリンク（GET）を踏み、メール変更を確定させる。
// #69 でメール検証を有効化したため、検証済みユーザーの change-email は即時変更せず、
// 新アドレス宛に確認リンクを送る（Better Auth の change-email-verification フロー）。
// リンクを踏むと email が新アドレスへ更新され、callbackURL("/") へ 302 リダイレクトする。
async function completeEmailChange(cookie: string, to: string) {
  const mail = (await listEmails()).findLast((e) => e.to === to);
  expect(mail, `${to} 宛の確認メールが受信箱に無い`).toBeTruthy();
  const body = mail?.text ?? mail?.html ?? "";
  const match = body.match(/https?:\/\/[^\s"]+/);
  expect(match, `確認リンクがメール本文に無い: ${body}`).toBeTruthy();
  // 同じブラウザ（cookie）でリンクを踏む想定。session.user.email が変更前メールと一致するため
  // INVALID_USER にならず変更が確定する。
  const res = await SELF.fetch(match?.[0] ?? "", { headers: { cookie }, redirect: "manual" });
  expect(res.status).toBe(302);
}

describe("POST /api/auth/change-email（メールアドレス変更）", () => {
  // signUpAndGetCookie は #69 のサインアップ時確認メールを 1 通発生させる。
  // change-email の確認メールだけを観測したいため各テスト前にクリアする。
  beforeEach(async () => {
    await clearEmails();
  });

  it("確認リンク踏破で新しいメールに変更でき、変更後のメールでサインインできる", async () => {
    const cookie = await signUpAndGetCookie("ce-basic@example.com");
    await clearEmails();

    const res = await changeEmail(cookie, "ce-basic-new@example.com");
    expect(res.status).toBe(200);
    // 確認リンクを踏むまでは変更されない。
    expect(await getDbEmail("ce-basic-new@example.com")).toBeNull();
    expect(await getDbEmail("ce-basic@example.com")).toBe("ce-basic@example.com");

    await completeEmailChange(cookie, "ce-basic-new@example.com");
    expect(await getDbEmail("ce-basic-new@example.com")).toBe("ce-basic-new@example.com");
    expect(await getDbEmail("ce-basic@example.com")).toBeNull();

    const signInRes = await signIn("ce-basic-new@example.com");
    expect(signInRes.status).toBe(200);
  });

  it("確認リンク踏破後も同じ cookie で新メールのセッションが取れる", async () => {
    const cookie = await signUpAndGetCookie("ce-session@example.com");
    await clearEmails();

    const res = await changeEmail(cookie, "ce-session-new@example.com");
    expect(res.status).toBe(200);
    await completeEmailChange(cookie, "ce-session-new@example.com");

    const sessionRes = await SELF.fetch(`${BASE}/api/auth/get-session`, {
      headers: { cookie },
    });
    expect(sessionRes.status).toBe(200);
    const session = await sessionRes.json<{ user: { email: string } } | null>();
    expect(session?.user.email).toBe("ce-session-new@example.com");
  });

  it("無効・期限切れトークンのリンクではメールアドレスは変更されない", async () => {
    const cookie = await signUpAndGetCookie("ce-bad-token@example.com");
    await clearEmails();

    const res = await changeEmail(cookie, "ce-bad-token-new@example.com");
    expect(res.status).toBe(200);

    // 確認メールと同形だが明らかに無効なトークンでリンクを踏む。verify-email は
    // INVALID_TOKEN / TOKEN_EXPIRED いずれも callbackURL に error を付けて 302 で戻し、
    // メールアドレスは更新しない（受け入れ条件: 期限切れ・無効トークンでは変更されない）。
    const callbackURL = `${WEB_ORIGIN}/verify-email`;
    const verifyRes = await SELF.fetch(
      `${BASE}/api/auth/verify-email?token=obviously-invalid&callbackURL=${encodeURIComponent(callbackURL)}`,
      { headers: { cookie }, redirect: "manual" },
    );
    expect(verifyRes.status).toBe(302);
    expect(verifyRes.headers.get("location") ?? "").toContain(`${callbackURL}?error=`);

    // 変更前のメールのまま、新アドレスは作られていない。
    expect(await getDbEmail("ce-bad-token@example.com")).toBe("ce-bad-token@example.com");
    expect(await getDbEmail("ce-bad-token-new@example.com")).toBeNull();
  });

  it("大文字を含む入力は小文字に正規化して保存される", async () => {
    const cookie = await signUpAndGetCookie("ce-case@example.com");
    await clearEmails();

    const res = await changeEmail(cookie, "CE-Case-New@Example.com");
    expect(res.status).toBe(200);
    // 確認メールは正規化後の小文字アドレス宛に届く。
    await completeEmailChange(cookie, "ce-case-new@example.com");
    expect(await getDbEmail("ce-case-new@example.com")).toBe("ce-case-new@example.com");
  });

  // Better Auth は既存メールとの重複を黙って成功（{ status: true }）で返すため、
  // hooks.before の重複チェックが 400 + 日本語メッセージを返すことを確認する。
  it("既存ユーザーのメールアドレスへは変更できない（400）", async () => {
    await signUpAndGetCookie("ce-taken@example.com");
    const cookie = await signUpAndGetCookie("ce-dup@example.com");

    const res = await changeEmail(cookie, "ce-taken@example.com");

    expect(res.status).toBe(400);
    const body = await res.json<{ message?: string }>();
    expect(body.message).toBe("このメールアドレスはすでに使用されています");
    // 変更されていないこと。
    expect(await getDbEmail("ce-dup@example.com")).toBe("ce-dup@example.com");
  });

  it("大文字小文字違いの既存メールも重複として弾く", async () => {
    await signUpAndGetCookie("ce-taken-case@example.com");
    const cookie = await signUpAndGetCookie("ce-dup-case@example.com");

    const res = await changeEmail(cookie, "CE-TAKEN-CASE@example.com");

    expect(res.status).toBe(400);
  });

  it("不正な形式のメールアドレスへは変更できない（400）", async () => {
    const cookie = await signUpAndGetCookie("ce-invalid@example.com");

    const res = await changeEmail(cookie, "not-an-email");

    expect(res.status).toBe(400);
    expect(await getDbEmail("ce-invalid@example.com")).toBe("ce-invalid@example.com");
  });

  it("現在のメールアドレスと同じ値へは「重複」ではなく「変更なし」のエラーになる（400）", async () => {
    const cookie = await signUpAndGetCookie("ce-same@example.com");

    const res = await changeEmail(cookie, "ce-same@example.com");

    expect(res.status).toBe(400);
    // hooks.before の重複チェックはスキップされ、Better Auth 本体のエラーが返る。
    const body = await res.json<{ message?: string }>();
    expect(body.message).toBe("Email is the same");
  });

  it("未ログインでは変更できない（401）", async () => {
    const res = await SELF.fetch(`${BASE}/api/auth/change-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newEmail: "ce-anon@example.com" }),
    });
    expect(res.status).toBe(401);
  });

  // hooks.before はエンドポイント本体の認証より先に走るため、未認証でも重複チェックが
  // 動くと 400/401 のステータス差でメールの存在有無が列挙できてしまう。
  // セッションが無い場合はチェックをスキップし、常に 401 になることを確認する。
  it("未ログインでは既存メールを指定しても存在有無が漏れない（401）", async () => {
    await signUpAndGetCookie("ce-enum@example.com");

    const res = await SELF.fetch(`${BASE}/api/auth/change-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newEmail: "ce-enum@example.com" }),
    });

    expect(res.status).toBe(401);
  });
});
