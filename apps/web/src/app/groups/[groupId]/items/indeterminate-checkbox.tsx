"use client";

import { useEffect, useRef } from "react";

type Props = {
  checked: boolean;
  // 一部選択などの中間状態。HTML 属性ではなく DOM プロパティのため ref 経由で設定する。
  indeterminate: boolean;
  onChange: () => void;
  "aria-label": string;
};

// indeterminate 表示に対応したチェックボックス（Issue #49: 全選択）。
// 表示のみを担い、選択ロジックは持たない。
export function IndeterminateCheckbox({
  checked,
  indeterminate,
  onChange,
  "aria-label": ariaLabel,
}: Props) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input ref={ref} type="checkbox" checked={checked} onChange={onChange} aria-label={ariaLabel} />
  );
}
