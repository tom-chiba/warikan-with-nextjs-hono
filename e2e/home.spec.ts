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

// #76: 未ログインでタブを切り替えて戻ると、入力途中のサインアップ値が消える回帰の防止。
// better-auth は refetchOnWindowFocus でフォーカス復帰のたびにセッションを再取得し、未ログイン
// （data === null）では isPending が true に戻る。useResolvedSession で一度解決したら保留に戻さない
// ことで AuthPanel の再マウント（＝入力値の破棄）を防ぐ。
test("未ログインでフォーカス再取得が起きてもサインアップ入力値が消えない（#76）", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "サインアップ" }).click();

  const email = `e2e-focus-${Date.now()}@example.com`;
  await page.getByLabel("名前").fill("Focus User");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill("password1234");

  // タブ復帰によるセッション再取得を、visibilitychange イベントの dispatch で再現する
  //（better-auth の focus-manager が visibilityState === "visible" で再取得を起動する）。
  const sessionRefetch = page.waitForResponse((res) => res.url().includes("/api/auth/get-session"));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await sessionRefetch;

  // 再取得後も AuthPanel は再マウントされず、入力途中の値が保持される。
  await expect(page.getByLabel("メールアドレス")).toHaveValue(email);
  await expect(page.getByLabel("名前")).toHaveValue("Focus User");
  await expect(page.getByLabel("パスワード")).toHaveValue("password1234");
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

  // そのまま入力して保存までできる（等分はデフォルト ON のため、支払額を入れるだけで割勘金額が一致する #81）。
  await page.getByLabel("購入品名").fill("ランチ");
  await expect(page.getByRole("checkbox")).toBeChecked();
  await page.getByLabel("Home User の支払額").fill("1000");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("保存しました。続けて入力できます。")).toBeVisible();
});
