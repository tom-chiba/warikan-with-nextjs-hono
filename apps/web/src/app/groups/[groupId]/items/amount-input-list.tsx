"use client";

import type { ReactNode } from "react";
import type { Member } from "./item-form";

// 支払額・割勘金額それぞれの「メンバーごとに金額を入力する行リスト」を担う共通コンポーネント。
// 支払額欄と割勘金額欄は、末尾ボタン（割勘欄の「残りをここに」）の有無を除けば同型の
// number input リストなので 1 つに揃える。値・onChange・行末ボタンは呼び出し側から受け取り、
// 等分・過不足などのロジックは item-form 側に残す（本体は入力欄の描画に専念する）。
export function AmountInputList({
  members,
  values,
  // aria-label は `${メンバー名} ${labelSuffix}`（例: "わたし の支払額" / "わたし の割勘金額"）。
  labelSuffix,
  onChange,
  // 各行の入力欄末尾に差し込む任意の要素（割勘欄の「残りをここに」ボタンなど）。
  renderRowEnd,
}: {
  members: Member[];
  values: Record<string, string>;
  labelSuffix: string;
  onChange: (userId: string, value: string) => void;
  renderRowEnd?: (userId: string) => ReactNode;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {members.map((m) => {
        const input = (
          <input
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            aria-label={`${m.name} ${labelSuffix}`}
            value={values[m.userId] ?? ""}
            onChange={(e) => onChange(m.userId, e.target.value)}
            className="field w-32 text-right tabular-nums"
          />
        );
        return (
          <li key={m.userId} className="flex items-center justify-between gap-3">
            <span className="truncate">{m.name}</span>
            {renderRowEnd ? (
              <span className="flex items-center gap-2">
                {input}
                {renderRowEnd(m.userId)}
              </span>
            ) : (
              input
            )}
          </li>
        );
      })}
    </ul>
  );
}
