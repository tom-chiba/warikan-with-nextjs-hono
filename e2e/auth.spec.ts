import { expect, test } from "@playwright/test";

test("メールでサインアップするとログイン状態になり、サインアウトできる", async ({ page }) => {
  // 実行ごとに一意のメールにして「既に存在」を避ける。
  const email = `e2e-${Date.now()}@example.com`;

  await page.goto("/");

  await page.getByLabel("名前").fill("E2E User");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill("password1234");
  await page.getByRole("button", { name: "サインアップ" }).click();

  // ブラウザ→api のクロスオリジン認証が通り、ログイン状態になる
  //（常設ナビとグループ作成への誘導が出る。#51 でメール表示・サインアウトは設定へ移動）。
  await expect(page.getByRole("link", { name: "グループを作成" })).toBeVisible({
    timeout: 30_000,
  });

  // サインアウトは歯車 → 設定ハブから行う。アカウント情報にメールが表示される。
  await page.getByRole("link", { name: "設定" }).click();
  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole("button", { name: "サインアウト" }).click();
  await expect(page.getByRole("button", { name: "サインアップ" })).toBeVisible();
});
