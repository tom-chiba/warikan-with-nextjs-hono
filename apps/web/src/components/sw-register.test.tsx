import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { SwRegister } from "./sw-register";

const { registerServiceWorkerMock } = vi.hoisted(() => ({
  registerServiceWorkerMock: vi.fn(),
}));

vi.mock("@/lib/register-sw", () => ({
  registerServiceWorker: registerServiceWorkerMock,
}));

// 各テスト後にレンダリング結果を破棄し、モックの呼び出し履歴もクリアする。
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("マウント時に registerServiceWorker を一度だけ呼ぶ", () => {
  registerServiceWorkerMock.mockResolvedValue(undefined);

  render(<SwRegister />);

  expect(registerServiceWorkerMock).toHaveBeenCalledTimes(1);
});

test("何も描画しない", () => {
  registerServiceWorkerMock.mockResolvedValue(undefined);

  const { container } = render(<SwRegister />);

  expect(container).toBeEmptyDOMElement();
});
