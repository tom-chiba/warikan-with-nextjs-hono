import { expect, type Page, test } from "@playwright/test";
import { completeVerification, signUpAndVerify } from "./helpers/auth";

// サインアップ（#69 の確認リンク踏破まで）して設定ページを開く共通操作。
// 実行ごとに一意のメールにして「既に存在」を避ける（auth.spec.ts と同じパターン）。
async function signUpAndOpenSettings(page: Page, email: string, password: string) {
  await signUpAndVerify(page, { name: "E2E Settings User", email, password });
  await page.getByRole("link", { name: "設定" }).click();
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "サインアウト" }).click();
  await expect(page.getByRole("button", { name: "サインイン" })).toBeVisible();
}

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "サインイン" }).click();
}

test("メールアドレス変更は新アドレスの確認リンクで完了し、新しいメールでサインインできる", async ({
  page,
}) => {
  const email = `e2e-ce-${Date.now()}@example.com`;
  const newEmail = `e2e-ce-new-${Date.now()}@example.com`;
  const password = "password1234";

  await signUpAndOpenSettings(page, email, password);

  await page.getByRole("button", { name: "メールアドレスを変更" }).click();
  await page.getByLabel("新しいメールアドレス").fill(newEmail);
  await page.getByRole("button", { name: "保存" }).click();

  // #69: 検証済みユーザーの変更は即時反映されず、新アドレス宛に確認メールが送られる。
  await expect(page.getByText(/確認メールを送信しました/)).toBeVisible();

  // 新アドレスに届いた確認リンクを踏むと変更が確定する。
  await completeVerification(page, newEmail);

  // 変更後のメールアドレスでサインインし直せる（受け入れ条件）。
  // サインアウト導線は設定ハブにあるため設定へ移動する。
  await page.goto("/settings");
  await signOut(page);
  await signIn(page, newEmail, password);
  await expect(page.getByRole("link", { name: "グループを作成" })).toBeVisible({
    timeout: 30_000,
  });
});

test("既存ユーザーのメールアドレスへは変更できずエラーが表示される", async ({ page }) => {
  const takenEmail = `e2e-ce-taken-${Date.now()}@example.com`;
  const email = `e2e-ce-dup-${Date.now()}@example.com`;
  const password = "password1234";

  // 先に別ユーザーを作って takenEmail を占有しておく。
  await signUpAndOpenSettings(page, takenEmail, password);
  await signOut(page);

  await signUpAndOpenSettings(page, email, password);
  await page.getByRole("button", { name: "メールアドレスを変更" }).click();
  await page.getByLabel("新しいメールアドレス").fill(takenEmail);
  await page.getByRole("button", { name: "保存" }).click();

  await expect(page.getByText("このメールアドレスはすでに使用されています")).toBeVisible();
});

test("パスワードを変更すると新しいパスワードでサインインできる", async ({ page }) => {
  const email = `e2e-cp-${Date.now()}@example.com`;
  const password = "password1234";
  const newPassword = "new-password1234";

  await signUpAndOpenSettings(page, email, password);

  await page.getByRole("button", { name: "パスワードを変更" }).click();
  await page.getByLabel("現在のパスワード").fill(password);
  await page.getByLabel("新しいパスワード").fill(newPassword);
  await page.getByRole("button", { name: "保存" }).click();

  await expect(page.getByText("パスワードを変更しました")).toBeVisible();

  // 変更後のパスワードでサインインし直せる（受け入れ条件）。
  await signOut(page);
  await signIn(page, email, newPassword);
  await expect(page.getByRole("link", { name: "グループを作成" })).toBeVisible();
});

test("現在のパスワードが誤っているとエラーが表示される", async ({ page }) => {
  const email = `e2e-cp-wrong-${Date.now()}@example.com`;

  await signUpAndOpenSettings(page, email, "password1234");

  await page.getByRole("button", { name: "パスワードを変更" }).click();
  await page.getByLabel("現在のパスワード").fill("wrong-password");
  await page.getByLabel("新しいパスワード").fill("new-password1234");
  await page.getByRole("button", { name: "保存" }).click();

  await expect(page.getByText("現在のパスワードが正しくありません")).toBeVisible();
});
