import { expect, test } from "@playwright/test";

// エピック #3 の統合確認: グループ作成 → 招待リンク発行 → 別ユーザーがリンクから参加 →
// メンバー一覧に 2 人が反映される、という横断フローを通しで検証する。
test("グループ作成→招待→別ユーザーが参加→メンバー一覧に反映", async ({ browser }) => {
  // 実行ごとに一意のメールにして「既に存在」を避ける。
  const stamp = Date.now();
  const ownerEmail = `e2e-owner-${stamp}@example.com`;
  const inviteeEmail = `e2e-invitee-${stamp}@example.com`;

  // ── オーナー: サインアップしてグループを作成する ──
  const ownerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  await owner.goto("/");
  await owner.getByRole("tab", { name: "サインアップ" }).click();
  await owner.getByLabel("名前").fill("Owner");
  await owner.getByLabel("メールアドレス").fill(ownerEmail);
  await owner.getByLabel("パスワード").fill("password1234");
  await owner.getByRole("button", { name: "サインアップ" }).click();
  // ログイン状態になると常設ナビとグループ作成への誘導が出る（#51）。
  await expect(owner.getByRole("link", { name: "グループを作成" })).toBeVisible({
    timeout: 30_000,
  });

  await owner.goto("/groups");
  await owner.getByLabel("グループ名").fill("E2E 旅行");
  await owner.getByRole("button", { name: "作成" }).click();
  await expect(owner).toHaveURL(/\/groups\/[0-9a-f-]+$/);

  // ── オーナー: 招待リンクを発行して URL を取得する ──
  await owner.getByRole("button", { name: "招待リンクを発行" }).click();
  const inviteCode = owner.locator("code", { hasText: "/invite/" });
  await expect(inviteCode).toBeVisible({ timeout: 30_000 });
  const inviteUrl = await inviteCode.textContent();
  const invitePath = new URL(inviteUrl ?? "").pathname;

  // ── 招待された側: 別コンテキストでリンクを開き、サインアップして参加する ──
  const inviteeCtx = await browser.newContext();
  const invitee = await inviteeCtx.newPage();
  await invitee.goto(invitePath);
  // 未ログインなので認証パネルが出る。サインアップするとセッションが更新され参加確認に切り替わる。
  await invitee.getByRole("tab", { name: "サインアップ" }).click();
  await invitee.getByLabel("名前").fill("Invitee");
  await invitee.getByLabel("メールアドレス").fill(inviteeEmail);
  await invitee.getByLabel("パスワード").fill("password1234");
  await invitee.getByRole("button", { name: "サインアップ" }).click();

  await expect(invitee.getByText("E2E 旅行")).toBeVisible({ timeout: 30_000 });
  await invitee.getByRole("button", { name: "参加する" }).click();

  // 参加後はグループ画面へ遷移し、メンバー一覧に両者が表示される。
  await expect(invitee).toHaveURL(/\/groups\/[0-9a-f-]+$/);
  await expect(invitee.getByText(inviteeEmail)).toBeVisible({ timeout: 30_000 });
  await expect(invitee.getByText(ownerEmail)).toBeVisible();

  await ownerCtx.close();
  await inviteeCtx.close();
});
