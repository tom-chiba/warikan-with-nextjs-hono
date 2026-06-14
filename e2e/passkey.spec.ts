import { expect, test } from "@playwright/test";
import { API_ORIGIN, signUpAndVerify } from "./helpers/auth";

// パスキー（WebAuthn）の登録〜ログインを検証する（#90）。
// 実機の生体認証ダイアログは自動化できないため、CDP の WebAuthn 仮想オーセンティケータを使う。
// hasResidentKey + isUserVerified + automaticPresenceSimulation により、登録・認証ともに
// ユーザー操作なしで自動承認される。rpID は dev の web オリジン（localhost）に一致する。
test("パスキーを登録し、サインアウト後にパスキーでログインできる", async ({ page, context }) => {
  // 実行ごとに一意のメールにして「既に存在」を避ける。
  const email = `e2e-passkey-${Date.now()}@example.com`;

  // 仮想オーセンティケータを有効化する。サインアウトを跨いでもブラウザ側に credential が残る。
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  // メールでサインアップ→確認リンクでログイン状態にする（既存のメール+パスワード経路は不変）。
  await signUpAndVerify(page, { name: "E2E Passkey", email });

  // 設定 → このデバイスにパスキーを追加（ログイン済みのため自分の user.id に紐づく）。
  await page.getByRole("link", { name: "設定" }).click();
  await page.getByRole("button", { name: "このデバイスにパスキーを追加" }).click();

  // 仮想オーセンティケータに credential が作成され、一覧に削除導線（= 登録済み）が現れる。
  await expect
    .poll(
      async () => {
        const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
        return credentials.length;
      },
      { message: "仮想オーセンティケータに credential が登録されない", timeout: 15_000 },
    )
    .toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "削除", exact: true })).toBeVisible({
    timeout: 15_000,
  });

  // サインアウトして未ログインのサインイン画面へ戻る。
  await page.getByRole("button", { name: "サインアウト" }).click();
  await expect(page.getByRole("button", { name: "サインイン" })).toBeVisible();

  // パスキーでログイン（メール/パスワード入力なし）。同一アカウントに到達する。
  await page.getByRole("button", { name: "パスキーでログイン" }).click();
  await expect(page.getByRole("link", { name: "グループを作成" })).toBeVisible({
    timeout: 30_000,
  });

  // 同一アカウント（同じ user.id）に到達したことを、設定のアカウント情報のメールで確認する。
  await page.getByRole("link", { name: "設定" }).click();
  await expect(page.getByText(email)).toBeVisible({ timeout: 15_000 });
});

// セッション鮮度（freshAge）切れ時の再認証フロー（#105）。最後のログインから 24h 以上経った
// セッションでは passkey 登録が 403（SESSION_NOT_FRESH）で弾かれるため、パスワード再入力を求め、
// 再認証に成功するとそのまま登録を続行する。テスト専用フックで created_at を過去へ巻き戻して再現する。
test("古いセッションではパスワード再認証を経てパスキーを登録できる", async ({ page, context }) => {
  const email = `e2e-passkey-reauth-${Date.now()}@example.com`;
  const password = "password1234";

  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  await signUpAndVerify(page, { name: "E2E Passkey Reauth", email, password });

  // 現在のセッションの created_at を 25h 前へ巻き戻し、「ログインから 24h 超」を再現する。
  // page.request はブラウザのセッション cookie を引き継ぐため、ログイン中セッションが対象になる。
  const expireRes = await page.request.post(`${API_ORIGIN}/__test__/expire-freshness`);
  expect(expireRes.ok()).toBe(true);

  await page.getByRole("link", { name: "設定" }).click();
  await page.getByRole("button", { name: "このデバイスにパスキーを追加" }).click();

  // 鮮度切れを検知し、パスワード再入力 UI が現れる（OS ダイアログには到達しない）。
  const passwordField = page.getByLabel("パスワード", { exact: true });
  await expect(passwordField).toBeVisible({ timeout: 15_000 });

  // まず誤ったパスワードを入れるとエラーになり、UI は再入力を促したまま。
  await passwordField.fill("wrong-password");
  await page.getByRole("button", { name: "再認証してパスキーを追加" }).click();
  await expect(page.getByText("パスワードが正しくありません。")).toBeVisible({ timeout: 15_000 });

  // 正しいパスワードで再認証すると新しいセッションが作られ、登録が続行されて成功する。
  await passwordField.fill(password);
  await page.getByRole("button", { name: "再認証してパスキーを追加" }).click();

  await expect
    .poll(
      async () => {
        const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
        return credentials.length;
      },
      { message: "再認証後に credential が登録されない", timeout: 15_000 },
    )
    .toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "削除", exact: true })).toBeVisible({
    timeout: 15_000,
  });
});
