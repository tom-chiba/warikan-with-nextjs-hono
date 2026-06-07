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

// グループ名の変更（#65）: owner がインライン編集で名前を変え、見出しと一覧に反映される。
test("owner はグループ名を変更でき、一覧にも反映される", async ({ page }) => {
  const stamp = Date.now();
  const email = `e2e-rename-${stamp}@example.com`;

  // サインアップしてグループを作成する。
  await page.goto("/");
  await page.getByRole("tab", { name: "サインアップ" }).click();
  await page.getByLabel("名前").fill("Rename Owner");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill("password1234");
  await page.getByRole("button", { name: "サインアップ" }).click();
  await expect(page.getByRole("link", { name: "グループを作成" })).toBeVisible({
    timeout: 30_000,
  });

  await page.goto("/groups");
  await page.getByLabel("グループ名").fill("変更前グループ");
  await page.getByRole("button", { name: "作成" }).click();
  await expect(page).toHaveURL(/\/groups\/[0-9a-f-]+$/);

  // 見出しにグループ名が表示され、owner なので「変更」ボタンが出る。
  await expect(page.getByRole("heading", { name: "変更前グループ" })).toBeVisible({
    timeout: 30_000,
  });

  // インライン編集で名前を変更する。
  await page.getByRole("button", { name: "変更", exact: true }).click();
  const nameInput = page.getByLabel("グループ名");
  await expect(nameInput).toBeVisible();
  await nameInput.fill("変更後グループ");
  await page.getByRole("button", { name: "保存" }).click();

  // フォームが閉じ、見出しが新しい名前になる。
  await expect(page.getByRole("heading", { name: "変更後グループ" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(nameInput).not.toBeVisible();

  // グループ一覧にも反映される。
  await page.goto("/groups");
  await expect(page.getByText("変更後グループ")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("変更前グループ")).not.toBeVisible();
});

// member にはグループ名の「変更」ボタンが表示されない（#65 受け入れ条件）。
test("member にはグループ名の変更ボタンが表示されない", async ({ browser }) => {
  const stamp = Date.now();
  const ownerEmail = `e2e-rn-owner-${stamp}@example.com`;
  const memberEmail = `e2e-rn-member-${stamp}@example.com`;

  // ── オーナー: サインアップ → グループ作成 → 招待リンク発行 ──
  const ownerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  await owner.goto("/");
  await owner.getByRole("tab", { name: "サインアップ" }).click();
  await owner.getByLabel("名前").fill("RN Owner");
  await owner.getByLabel("メールアドレス").fill(ownerEmail);
  await owner.getByLabel("パスワード").fill("password1234");
  await owner.getByRole("button", { name: "サインアップ" }).click();
  await expect(owner.getByRole("link", { name: "グループを作成" })).toBeVisible({
    timeout: 30_000,
  });

  await owner.goto("/groups");
  await owner.getByLabel("グループ名").fill("RN グループ");
  await owner.getByRole("button", { name: "作成" }).click();
  await expect(owner).toHaveURL(/\/groups\/[0-9a-f-]+$/);
  // owner には「変更」ボタンが見えている。
  await expect(owner.getByRole("button", { name: "変更", exact: true })).toBeVisible({
    timeout: 30_000,
  });

  await owner.getByRole("button", { name: "招待リンクを発行" }).click();
  const inviteCode = owner.locator("code", { hasText: "/invite/" });
  await expect(inviteCode).toBeVisible({ timeout: 30_000 });
  const invitePath = new URL((await inviteCode.textContent()) ?? "").pathname;

  // ── メンバー: 招待リンクから参加してグループ画面を開く ──
  const memberCtx = await browser.newContext();
  const member = await memberCtx.newPage();
  await member.goto(invitePath);
  await member.getByRole("tab", { name: "サインアップ" }).click();
  await member.getByLabel("名前").fill("RN Member");
  await member.getByLabel("メールアドレス").fill(memberEmail);
  await member.getByLabel("パスワード").fill("password1234");
  await member.getByRole("button", { name: "サインアップ" }).click();
  await expect(member.getByText("RN グループ")).toBeVisible({ timeout: 30_000 });
  await member.getByRole("button", { name: "参加する" }).click();
  await expect(member).toHaveURL(/\/groups\/[0-9a-f-]+$/);

  // 見出しにグループ名は表示されるが、「変更」ボタンは出ない。
  await expect(member.getByRole("heading", { name: "RN グループ" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(member.getByRole("button", { name: "変更", exact: true })).toHaveCount(0);

  await ownerCtx.close();
  await memberCtx.close();
});
