import { renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useResolvedSession } from "@/lib/use-resolved-session";

// 内部の useSession（better-auth）をモックし、戻り値を render ごとに差し替えてラッチ挙動を検証する。
const { useSessionMock } = vi.hoisted(() => ({ useSessionMock: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ useSession: () => useSessionMock() }));

afterEach(() => {
  vi.clearAllMocks();
});

test("初回解決前は isPending をそのまま透過する", () => {
  useSessionMock.mockReturnValue({ data: null, isPending: true, error: null });
  const { result } = renderHook(() => useResolvedSession());
  expect(result.current.isPending).toBe(true);
});

test("一度解決したら、再取得で isPending が true に戻っても保留扱いに戻さない（#76）", () => {
  // 初回解決（未ログインと判明）。
  useSessionMock.mockReturnValue({ data: null, isPending: false, error: null });
  const { result, rerender } = renderHook(() => useResolvedSession());
  expect(result.current.isPending).toBe(false);

  // フォーカス再取得で未ログインのまま isPending が true に戻る（dist の isPending: data === null）。
  // ここで保留に戻すと AuthPanel がアンマウントされ入力値が消えるため、false を維持する。
  useSessionMock.mockReturnValue({ data: null, isPending: true, error: null });
  rerender();
  expect(result.current.isPending).toBe(false);
});

test("data・error・refetch は加工せず透過する", () => {
  const refetch = vi.fn();
  const session = { user: { id: "u1", email: "me@example.com" } };
  useSessionMock.mockReturnValue({ data: session, isPending: false, error: null, refetch });
  const { result } = renderHook(() => useResolvedSession());
  expect(result.current.data).toBe(session);
  expect(result.current.error).toBeNull();
  expect(result.current.refetch).toBe(refetch);
});
