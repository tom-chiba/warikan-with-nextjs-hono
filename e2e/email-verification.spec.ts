import { expect, test } from "@playwright/test";
import { completeVerification, fetchVerificationUrl, submitSignUp } from "./helpers/auth";

// #69 のサインアップ時メール検証フロー一式を通しで検証する。メール送信は #70 のインメモリ受信箱でモックする。

test("サインアップ後、確認リンクを踏むまではサインインできず、踏むとサインインできる", async ({
  page,
}) => {
  const email = `e2e-ev-${Date.now()}@example.com`;
  const password = "password1234";

  // サインアップは仮登録。確認メール送信済み表示に切り替わる。
  await page.goto("/");
  await submitSignUp(page, { name: "EV User", email, password });

  // この時点（サインアップ直後）の確認リンクを控えておく。後続のサインイン試行は sendOnSignIn で
  // 別の確認メール（callbackURL は既定の "/"）を発生させるため、踏むリンクはここで確定させる。
  const verifyUrl = await fetchVerificationUrl(page, email);

  // 未検証のままサインインを試みると、その旨が表示される（サインインできない）。
  await page.getByRole("button", { name: "サインインへ戻る" }).click();
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "サインイン" }).click();
  await expect(page.getByText(/メールアドレスの確認が完了していません/)).toBeVisible();
  await expect(page.getByRole("link", { name: "グループを作成" })).toHaveCount(0);

  // サインアップ時の確認リンクを踏むと検証が完了し、autoSignIn でサインイン状態になる。
  await page.goto(verifyUrl);
  await expect(page.getByText(/メールアドレスの確認が完了しました/)).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("link", { name: "アプリへ" }).click();
  await expect(page.getByRole("link", { name: "グループを作成" })).toBeVisible({
    timeout: 30_000,
  });
});

test("未検証サインインの再送ボタンから確認メールを再送でき、そのリンクで検証できる", async ({
  page,
}) => {
  const email = `e2e-ev-resend-${Date.now()}@example.com`;
  const password = "password1234";

  await page.goto("/");
  await submitSignUp(page, { name: "EV Resend", email, password });

  // サインインを試みて未検証案内 + 再送ボタンを出す。
  await page.getByRole("button", { name: "サインインへ戻る" }).click();
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "サインイン" }).click();
  await expect(page.getByText(/メールアドレスの確認が完了していません/)).toBeVisible();

  // 明示的な再送。完了表示が出る。
  await page.getByRole("button", { name: "確認メールを再送" }).click();
  await expect(page.getByText(/確認メールを再送しました/)).toBeVisible();

  // 再送されたリンクで検証できる。
  await completeVerification(page, email);
  await page.getByRole("link", { name: "アプリへ" }).click();
  await expect(page.getByRole("link", { name: "グループを作成" })).toBeVisible({
    timeout: 30_000,
  });
});

test("無効・期限切れトークンのリンクではエラーを表示し、再送につなげられる", async ({ page }) => {
  // API は無効・期限切れトークンを ?error= 付きで /verify-email に戻す。直接その状態を開く。
  await page.goto("/verify-email?error=TOKEN_EXPIRED");

  await expect(page.getByText(/このリンクは無効か期限切れです/)).toBeVisible();

  // 再送フォームから確認メールを送り直せる（受け入れ条件: 再送につなげられる）。
  // 列挙対策のため、入力メールの登録有無にかかわらず中立の完了表示になる。
  const email = `e2e-ev-expired-${Date.now()}@example.com`;
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByRole("button", { name: "確認メールを再送" }).click();
  await expect(page.getByText(/確認メールを再送しました/)).toBeVisible();
});
