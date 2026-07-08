"use client";

import { useState } from "react";

// 非同期アクション実行時の busy / error 定型
// （setError(null) → setBusy(true) → try / catch / finally { setBusy(false) }）を 1 箇所に集約するフック。
// action が throw した Error の message を画面に表示し、Error 以外が throw された場合は
// fallbackMessage にフォールバックする（元々 use-item-actions.ts の run にあった骨格を汎用化した #127）。
// エラーだけを busy を伴わず更新したい箇所（コピー失敗・編集フォームを開くときのリセット等）向けに
// setError も返す。
export function useAsyncAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>, fallbackMessage: string) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallbackMessage);
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, run, setError };
}
