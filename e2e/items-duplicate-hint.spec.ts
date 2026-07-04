import { expect, test } from "@playwright/test";
import { signUpAndVerify } from "./helpers/auth";

// 購入日連動の「これってもう入れたっけ？」確認表示。
// 購入品入力フォームで購入日を選ぶと、その日に入力済みのアイテムを控えめに一覧する。
test("購入日を選ぶと、その日に入力済みのアイテムを表示する", async ({ page }) => {
  const email = `e2e-dup-${Date.now()}@example.com`;
  await signUpAndVerify(page, { name: "Dup User", email });

  // グループを 1 件作成 → トップでそのままクイック入力できる状態にする。
  await page.goto("/groups");
  await page.getByLabel("グループ名").fill("E2E 重複確認");
  await page.getByRole("button", { name: "作成" }).click();
  await expect(page).toHaveURL(/\/groups\/[0-9a-f-]+$/);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "E2E 重複確認 に購入品を入力" })).toBeVisible();

  // 1 件目を購入日付きで保存する（等分 ON のため支払額入力だけで割勘が一致する）。
  await page.getByLabel("購入品名").fill("ランチ");
  await page.getByLabel("購入日（任意）").fill("2026-06-10");
  await page.getByLabel("Dup User の支払額").fill("1000");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("保存しました")).toBeVisible();

  // 2 件目の入力で同じ購入日を選ぶと、その日に入力済みの「ランチ」が注記される。
  await page.getByLabel("購入日（任意）").fill("2026-06-10");
  await expect(page.getByText(/この日に入力済み（1件）/)).toBeVisible();
  await expect(page.getByText("ランチ")).toBeVisible();

  // 入力済みのない別の日付に変えると注記は消える。
  await page.getByLabel("購入日（任意）").fill("2026-06-11");
  await expect(page.getByText(/この日に入力済み/)).toBeHidden();
});

// 取得に失敗したときは無表示にせず、確認できなかった旨を控えめに知らせる
//（「0 件＝未入力」と「取得失敗」を取り違えて重複入力するのを防ぐため）。
test("購入日の入力済み取得に失敗したら確認不可を知らせる", async ({ page }) => {
  const email = `e2e-dup-err-${Date.now()}@example.com`;
  await signUpAndVerify(page, { name: "Err User", email });

  await page.goto("/groups");
  await page.getByLabel("グループ名").fill("E2E 取得失敗");
  await page.getByRole("button", { name: "作成" }).click();
  await expect(page).toHaveURL(/\/groups\/[0-9a-f-]+$/);

  // 購入日連動の取得（purchasedOn 付き GET）だけを失敗させる。
  await page.route(/\/items\?.*purchasedOn=/, (route) => route.fulfill({ status: 500 }));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "E2E 取得失敗 に購入品を入力" })).toBeVisible();

  await page.getByLabel("購入日（任意）").fill("2026-06-10");
  // 既定 retry 3 回（指数バックオフ）ぶんを見込んで待つ。
  await expect(page.getByText("この日の入力済みを確認できませんでした。")).toBeVisible({
    timeout: 15_000,
  });
});
