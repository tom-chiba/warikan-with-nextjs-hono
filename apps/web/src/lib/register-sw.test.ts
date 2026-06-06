import { afterEach, expect, test, vi } from "vitest";
import { registerServiceWorker } from "./register-sw";

afterEach(() => {
  // spy(console.error)の復元も含めてここに集約する。
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("開発環境では登録をスキップする", async () => {
  vi.stubEnv("NODE_ENV", "development");

  const result = await registerServiceWorker();

  expect(result.status).toBe("skipped-dev");
});

test("Service Worker API がない環境では unsupported を返す", async () => {
  vi.stubEnv("NODE_ENV", "production");
  // jsdom の navigator から serviceWorker を除いて未対応ブラウザを模倣する。
  vi.stubGlobal("navigator", {});

  const result = await registerServiceWorker();

  expect(result.status).toBe("unsupported");
});

test("本番環境では /sw.js を登録して registered を返す", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const registration = { scope: "/" };
  const register = vi.fn().mockResolvedValue(registration);
  vi.stubGlobal("navigator", { serviceWorker: { register } });

  const result = await registerServiceWorker();

  expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
  expect(result).toEqual({ status: "registered", registration });
});

test("登録に失敗しても例外を投げず error を返す", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const error = new Error("SecurityError");
  const register = vi.fn().mockRejectedValue(error);
  vi.stubGlobal("navigator", { serviceWorker: { register } });
  // 失敗時の console.error はテスト出力を汚さないよう抑止する。
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  const result = await registerServiceWorker();

  expect(result).toEqual({ status: "error", error });
  expect(consoleError).toHaveBeenCalled();
});
