import { expect, test } from "@playwright/test";
import { signUpAndVerify } from "./helpers/auth";

test("未ログインでトップページを開くとサインイン/サインアップフォームを表示する", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "warikan" })).toBeVisible();

  // 初期表示はサインイン。名前フィールドは出ない（#60）。
  await expect(page.getByLabel("メールアドレス")).toBeVisible();
  await expect(page.getByLabel("パスワード")).toBeVisible();
  await expect(page.getByRole("button", { name: "サインイン" })).toBeVisible();
  await expect(page.getByLabel("名前")).toBeHidden();

  // サインアップタブへ切り替えると名前フィールドが出る。
  await page.getByRole("tab", { name: "サインアップ" }).click();
  await expect(page.getByLabel("名前")).toBeVisible();
  await expect(page.getByRole("button", { name: "サインアップ" })).toBeVisible();
});

// #45: ログイン済みユーザーがアプリを開いたら、ワンタップも挟まず購入品入力に到達できる。
test("ログイン済みでグループが 1 件なら、トップページでそのまま購入品を入力できる", async ({
  page,
}) => {
  // 実行ごとに一意のメールにして「既に存在」を避ける。
  const email = `e2e-home-${Date.now()}@example.com`;

  // #69: サインアップ後、確認リンクを踏んで本登録（ログイン状態）にする。
  // ログイン状態になると常設ナビが出て、グループ 0 件のうちは作成への誘導が表示される（#51）。
  await signUpAndVerify(page, { name: "Home User", email });

  // グループを 1 件作成してトップへ戻ると、クイック入力フォームが表示される。
  await page.goto("/groups");
  await page.getByLabel("グループ名").fill("E2E ホーム入力");
  await page.getByRole("button", { name: "作成" }).click();
  await expect(page).toHaveURL(/\/groups\/[0-9a-f-]+$/);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "E2E ホーム入力 に購入品を入力" })).toBeVisible();

  // そのまま入力して保存までできる（等分で支払額と割勘金額を一致させる）。
  await page.getByLabel("購入品名").fill("ランチ");
  await page.getByLabel("Home User の支払額").fill("1000");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("保存しました。続けて入力できます。")).toBeVisible();
});
