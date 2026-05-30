import { expect, test } from "@playwright/test";

test("トップページが API のメッセージを表示する（web → api 通し）", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "warikan" })).toBeVisible();

  // ブラウザから api(:8787) を実際に叩いた結果が描画されることを確認する。
  await expect(page.getByText("API: Hello, chiba!")).toBeVisible();
});
