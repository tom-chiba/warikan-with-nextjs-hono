import { expect, test } from "@playwright/test";

test("メールでサインアップするとログイン状態になり、サインアウトできる", async ({ page }) => {
  // 実行ごとに一意のメールにして「既に存在」を避ける。
  const email = `e2e-${Date.now()}@example.com`;

  await page.goto("/");

  await page.getByLabel("名前").fill("E2E User");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill("password1234");
  await page.getByRole("button", { name: "サインアップ" }).click();

  // ブラウザ→api のクロスオリジン認証が通り、ログイン状態になる。
  await expect(page.getByText("ログイン中:")).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  await page.getByRole("button", { name: "サインアウト" }).click();
  await expect(page.getByRole("button", { name: "サインアップ" })).toBeVisible();
});
