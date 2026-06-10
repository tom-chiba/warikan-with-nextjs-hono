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

test("初回取得が失敗（error あり）したら latch せず、再試行の保留状態を握り潰さない", () => {
  // 初回取得失敗: better-auth は isPending を false にして error を立てる。
  // ここで latch すると再試行のローディング/再試行表示が壊れるため、成功時のみ latch する。
  useSessionMock.mockReturnValue({ data: null, isPending: false, error: { status: 500 } });
  const { result, rerender } = renderHook(() => useResolvedSession());
  // error はそのまま透過し、呼び出し側（page.tsx）が SessionError を出す。
  expect(result.current.isPending).toBe(false);

  // 再試行で better-auth は error を消し isPending を true にする。latch していなければ保留が維持される。
  useSessionMock.mockReturnValue({ data: null, isPending: true, error: null });
  rerender();
  expect(result.current.isPending).toBe(true);
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
