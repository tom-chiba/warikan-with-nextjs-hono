import { expect, type Page, test } from "@playwright/test";

// サインアップして設定ページを開く共通操作。
// 実行ごとに一意のメールにして「既に存在」を避ける（auth.spec.ts と同じパターン）。
async function signUpAndOpenSettings(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.getByRole("tab", { name: "サインアップ" }).click();
  await page.getByLabel("名前").fill("E2E Settings User");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "サインアップ" }).click();
  await expect(page.getByRole("link", { name: "グループを作成" })).toBeVisible({
    timeout: 30_000,
  });
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

test("メールアドレスを変更すると表示が更新され、新しいメールでサインインできる", async ({
  page,
}) => {
  const email = `e2e-ce-${Date.now()}@example.com`;
  const newEmail = `e2e-ce-new-${Date.now()}@example.com`;
  const password = "password1234";

  await signUpAndOpenSettings(page, email, password);

  await page.getByRole("button", { name: "メールアドレスを変更" }).click();
  await page.getByLabel("新しいメールアドレス").fill(newEmail);
  await page.getByRole("button", { name: "保存" }).click();

  // 成功メッセージが出て、セッション再取得により表示メールも新しい値になる。
  await expect(page.getByText("メールアドレスを変更しました")).toBeVisible();
  await expect(page.getByText(newEmail)).toBeVisible();

  // 変更後のメールアドレスでサインインし直せる（受け入れ条件）。
  await signOut(page);
  await signIn(page, newEmail, password);
  await expect(page.getByRole("link", { name: "グループを作成" })).toBeVisible();
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
