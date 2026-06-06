// Service Worker 登録の結果。テストで検証しやすいよう状態を明示する。
export type SwRegistrationResult =
  | { status: "registered"; registration: ServiceWorkerRegistration }
  | { status: "unsupported" }
  | { status: "skipped-dev" }
  | { status: "error"; error: unknown };

/**
 * Service Worker を登録する。
 * - 開発環境では HMR と干渉するため登録しない
 * - Service Worker API がない環境では何もしない
 * - updateViaCache: "none" で SW スクリプトの更新チェックに HTTP キャッシュを使わない
 */
export async function registerServiceWorker(): Promise<SwRegistrationResult> {
  if (process.env.NODE_ENV === "development") {
    return { status: "skipped-dev" };
  }

  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return { status: "unsupported" };
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    return { status: "registered", registration };
  } catch (error) {
    // PWA は付加機能なので、登録失敗でアプリの動作を止めない。
    console.error("Service Worker の登録に失敗しました:", error);
    return { status: "error", error };
  }
}
