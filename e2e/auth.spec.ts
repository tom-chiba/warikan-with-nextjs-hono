import { expect, test } from "@playwright/test";
import { signUpAndVerify } from "./helpers/auth";

test("メールでサインアップ→確認リンクで本登録するとログイン状態になり、サインアウトできる", async ({
  page,
}) => {
  // 実行ごとに一意のメールにして「既に存在」を避ける。
  const email = `e2e-${Date.now()}@example.com`;

  // #69: サインアップは仮登録。確認メールのリンクを踏んで本登録（ログイン状態）になる。
  await signUpAndVerify(page, { name: "E2E User", email });

  // サインアウトは歯車 → 設定ハブから行う。アカウント情報にメールが表示される。
  await page.getByRole("link", { name: "設定" }).click();
  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole("button", { name: "サインアウト" }).click();
  await expect(page.getByRole("button", { name: "サインイン" })).toBeVisible();
});
