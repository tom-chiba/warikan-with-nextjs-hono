"use client";

import { useEffect } from "react";
import { formatAmount } from "@/lib/format";

// 送金リストの 1 行分。表示名は呼び出し側で解決済みのものを渡す。
export type TransferRow = { key: string; from: string; to: string; amount: number };

// 未精算ビューの選択結果を画面下に出すサマリーバー（タップで SettlementSheet を開く）。
// 通常は 1 行で最大の送金だけを見せ、一覧の表示領域を広く保つ。
export function SettlementBar({
  count,
  transfers,
  onOpen,
}: {
  count: number;
  transfers: TransferRow[];
  onOpen: () => void;
}) {
  const top = transfers.reduce<TransferRow | undefined>(
    (max, t) => (max === undefined || t.amount > max.amount ? t : max),
    undefined,
  );
  const preview = top
    ? `${top.from} → ${top.to}  ${formatAmount(top.amount)} 円${
        transfers.length > 1 ? `  ほか ${transfers.length - 1} 件` : ""
      }`
    : "送金は不要です";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 bg-ink px-5 pt-3.5 pb-[max(1.125rem,env(safe-area-inset-bottom))] text-left text-paper"
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs font-bold tracking-wider opacity-70">
          選択 {count} 件 · 送金 {transfers.length} 件
        </span>
        <span className="truncate text-[15px] font-bold">{preview}</span>
      </span>
      <span className="shrink-0 border border-paper px-2.5 py-1.5 text-xs font-bold">
        送金リスト ↑
      </span>
    </button>
  );
}

// 送金リスト全件と精算ボタンを出すボトムシート。
export function SettlementSheet({
  count,
  transfers,
  busy,
  error,
  onSettle,
  onClose,
}: {
  count: number;
  transfers: TransferRow[];
  busy: boolean;
  error: string | null;
  onSettle: () => void;
  onClose: () => void;
}) {
  // Escape で閉じる。
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50">
      <div aria-hidden className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="送金リスト"
        className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[85dvh] w-full max-w-2xl flex-col gap-3 overflow-y-auto border-t-2 border-ink bg-paper px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div className="section-rule flex items-baseline justify-between">
          <h2 className="section-title">送金リスト</h2>
          <span className="flex items-center gap-3">
            <span className="text-sm font-bold tabular-nums">選択 {count} 件</span>
            <button type="button" autoFocus onClick={onClose} className="btn btn-line btn-sm">
              閉じる
            </button>
          </span>
        </div>
        {error && <p className="note-danger">{error}</p>}
        {transfers.length === 0 ? (
          <p className="note-muted">選択分の収支はすでに均衡しています（送金は不要です）。</p>
        ) : (
          <ul className="flex flex-col">
            {transfers.map((t) => (
              <li
                key={t.key}
                className="flex items-center justify-between border-b border-rule px-1 py-2.5 text-base"
              >
                <span>
                  {t.from} → {t.to}
                </span>
                <span className="text-lg font-extrabold tabular-nums">
                  {formatAmount(t.amount)} 円
                </span>
              </li>
            ))}
          </ul>
        )}
        <button type="button" disabled={busy} onClick={onSettle} className="btn btn-fill">
          選択した {count} 件を精算する
        </button>
      </div>
    </div>
  );
}
