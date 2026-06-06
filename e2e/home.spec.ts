import { expect, test } from "@playwright/test";

test("未ログインでトップページを開くとサインイン/サインアップフォームを表示する", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "warikan" })).toBeVisible();

  await expect(page.getByLabel("名前")).toBeVisible();
  await expect(page.getByLabel("メールアドレス")).toBeVisible();
  await expect(page.getByLabel("パスワード")).toBeVisible();
  await expect(page.getByRole("button", { name: "サインアップ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "サインイン" })).toBeVisible();
});
