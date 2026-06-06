/**
 * Service Worker を登録する。
 * - 開発環境では HMR と干渉するため登録しない
 * - Service Worker API がない環境では何もしない
 * - updateViaCache: "none" で SW スクリプトの更新チェックに HTTP キャッシュを使わない
 */
export async function registerServiceWorker(): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    return;
  }

  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
  } catch (error) {
    // PWA は付加機能なので、登録失敗でアプリの動作を止めない。
    console.error("Service Worker の登録に失敗しました:", error);
  }
}
