import { expect, type Page, test } from "@playwright/test";
import { API_ORIGIN, fetchResetUrl, signUpAndVerify } from "./helpers/auth";

// サインアップ（#69 の確認リンク踏破まで）してログイン状態にする共通操作。
async function signUp(page: Page, email: string, password: string) {
  await signUpAndVerify(page, { name: "E2E Reset User", email, password });
}

test("パスワードを忘れたユーザーがメールのリンクから再設定し、新パスワードでサインインできる", async ({
  page,
}) => {
  const email = `e2e-rp-${Date.now()}@example.com`;
  const oldPassword = "password1234";
  const newPassword = "new-password1234";

  // テスト間の独立性のため受信箱をクリアしてから始める。
  await page.request.delete(`${API_ORIGIN}/__test__/emails`);

  // 先にユーザーを用意し、サインアウトしておく。
  await signUp(page, email, oldPassword);
  await page.getByRole("link", { name: "設定" }).click();
  await page.getByRole("button", { name: "サインアウト" }).click();
  await expect(page.getByRole("button", { name: "サインイン" })).toBeVisible();

  // サインイン画面から再設定フローに入る。リンクはクライアント遷移のため、
  // 遷移完了（再設定ページの見出し表示）を待ってから入力する（ホーム側の入力欄に
  // 先行入力して遷移で値が失われるレースを避ける）。
  await page.getByRole("link", { name: "パスワードをお忘れですか？" }).click();
  await expect(page.getByRole("heading", { name: "パスワード再設定" })).toBeVisible();
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByRole("button", { name: "再設定リンクを送信" }).click();
  await expect(
    page.getByText(/登録されている場合、パスワード再設定用のリンクを送信しました/),
  ).toBeVisible();

  // 受信箱からリンクを取り出して踏む。API がトークンを検証し /reset-password へ ?token= 付きで戻す。
  const resetUrl = await fetchResetUrl(page, email);
  await page.goto(resetUrl);

  // 新しいパスワードを設定する。
  await page.getByLabel("新しいパスワード").fill(newPassword);
  await page.getByRole("button", { name: "パスワードを再設定" }).click();
  await expect(page.getByText(/パスワードを再設定しました/)).toBeVisible();

  // サインインへ誘導され、新パスワードでサインインできる（受け入れ条件）。
  await page.getByRole("button", { name: "サインインへ" }).click();
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(newPassword);
  await page.getByRole("button", { name: "サインイン" }).click();
  await expect(page.getByRole("link", { name: "グループを作成" })).toBeVisible({
    timeout: 30_000,
  });

  // 古いパスワードではサインインできないこと（再設定が効いている）。
  await page.getByRole("link", { name: "設定" }).click();
  await page.getByRole("button", { name: "サインアウト" }).click();
  await expect(page.getByRole("button", { name: "サインイン" })).toBeVisible();
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(oldPassword);
  await page.getByRole("button", { name: "サインイン" }).click();
  // サインインは失敗し、ログイン後のグループ作成導線は現れないままサインインボタンが残る。
  await expect(page.getByRole("button", { name: "サインイン" })).toBeVisible();
  await expect(page.getByRole("link", { name: "グループを作成" })).toHaveCount(0);
});

test("無効なトークンのリンクではエラーを表示し、再申請へ誘導する", async ({ page }) => {
  // ?error=INVALID_TOKEN は API が無効・期限切れトークンを検出したときに付けて戻すクエリ。
  await page.goto("/reset-password?error=INVALID_TOKEN");

  await expect(page.getByText(/このリンクは無効か期限切れです/)).toBeVisible();
  const retry = page.getByRole("link", { name: "パスワード再設定をやり直す" });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(page).toHaveURL(/\/forgot-password$/);
});

test("未登録メールでも登録済みと同じ中立メッセージを表示する（列挙対策）", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("メールアドレス").fill(`e2e-rp-unknown-${Date.now()}@example.com`);
  await page.getByRole("button", { name: "再設定リンクを送信" }).click();

  await expect(
    page.getByText(/登録されている場合、パスワード再設定用のリンクを送信しました/),
  ).toBeVisible();
});
