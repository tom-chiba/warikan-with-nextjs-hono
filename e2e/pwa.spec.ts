import { expect, test } from "@playwright/test";

// SW の登録自体は開発サーバーでは行わない設計(register-sw.ts)のため、
// ここでは PWA を構成する配信物(manifest / sw.js / head のメタタグ)を検証する。

test("manifest.webmanifest がインストールに必要な項目を配信する", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");

  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    name: "warikan",
    start_url: "/groups",
    scope: "/",
    display: "standalone",
  });
  // 192/512/maskable の 3 アイコンが揃っていること(installable の要件)。
  expect(manifest.icons).toHaveLength(3);
  for (const icon of manifest.icons) {
    const iconResponse = await request.get(icon.src);
    expect(iconResponse.ok()).toBe(true);
  }
});

test("sw.js が HTTP キャッシュ無効のヘッダー付きで配信される", async ({ request }) => {
  const response = await request.get("/sw.js");

  expect(response.ok()).toBe(true);
  expect(response.headers()["cache-control"]).toBe("no-cache, no-store, must-revalidate");
  expect(await response.text()).toContain('addEventListener("install"');
});

test("トップページの head に PWA 向けのタグが出力される", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    "/apple-touch-icon.png",
  );
  // ライト/ダーク両方の theme-color が media query 付きで出力されること。
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2);
});
