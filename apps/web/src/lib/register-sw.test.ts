import { afterEach, expect, test, vi } from "vitest";
import { registerServiceWorker } from "./register-sw";

afterEach(() => {
  // spy(console.error)の復元も含めてここに集約する。
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("開発環境では登録しない", async () => {
  vi.stubEnv("NODE_ENV", "development");
  const register = vi.fn();
  vi.stubGlobal("navigator", { serviceWorker: { register } });

  await registerServiceWorker();

  expect(register).not.toHaveBeenCalled();
});

test("Service Worker API がない環境では何もしない", async () => {
  vi.stubEnv("NODE_ENV", "production");
  // jsdom の navigator から serviceWorker を除いて未対応ブラウザを模倣する。
  vi.stubGlobal("navigator", {});

  await expect(registerServiceWorker()).resolves.toBeUndefined();
});

test("本番環境では /sw.js を登録する", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const register = vi.fn().mockResolvedValue({ scope: "/" });
  vi.stubGlobal("navigator", { serviceWorker: { register } });

  await registerServiceWorker();

  expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
});

test("登録に失敗しても例外を投げず console.error で報告する", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const error = new Error("SecurityError");
  const register = vi.fn().mockRejectedValue(error);
  vi.stubGlobal("navigator", { serviceWorker: { register } });
  // 失敗時の console.error はテスト出力を汚さないよう抑止する。
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  await expect(registerServiceWorker()).resolves.toBeUndefined();

  expect(consoleError).toHaveBeenCalledWith("Service Worker の登録に失敗しました:", error);
});
