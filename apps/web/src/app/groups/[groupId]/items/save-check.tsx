"use client";

import { useEffect, useState } from "react";

// 保存成功時に画面中央で一瞬だけ出す完了フィードバック（購入完了フィードバック案 1b）。
// 親側が保存のたびに key を変えて再マウントすることでエントランスを再生する。マウントから約 0.7 秒後に
// フェードアウトし、フェード（0.4 秒）後に DOM から外れる。日常の連続入力を妨げないよう、フェード中は
// タップを透過させ、表示中はタップで即座に閉じられるようにする。
export function SaveCheck({ label }: { label: string }) {
  // マウント直後は shown。0.7 秒後に fading、さらにフェード完了後 hidden。
  const [phase, setPhase] = useState<"shown" | "fading" | "hidden">("shown");

  useEffect(() => {
    // setState はいずれもタイマーのコールバック内（＝非同期）で行い、effect 本体では呼ばない。
    const hide = setTimeout(() => setPhase("fading"), 700);
    const remove = setTimeout(() => setPhase("hidden"), 700 + 400);
    return () => {
      clearTimeout(hide);
      clearTimeout(remove);
    };
  }, []);

  if (phase === "hidden") {
    return null;
  }

  const fading = phase === "fading";
  return (
    // 自動で消える一時的な確認表示。タップは常に下のフォームへ透過させ（backdrop は pointer-events:none）、
    // 保存直後にすぐ次の入力欄へ触れられるようにする。早閉じは行わず自動フェードのみで消す。
    <div className="save-check-backdrop" style={{ opacity: fading ? 0 : 1 }} aria-hidden={fading}>
      <div className="save-check-card" role="status">
        <span className="save-check-circle">
          <svg width="34" height="28" viewBox="0 0 34 28" fill="none" aria-hidden="true">
            <path
              d="M3 14L13 24L31 3"
              stroke="var(--paper)"
              strokeWidth="3.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="40"
              className="save-check-path"
            />
          </svg>
        </span>
        <span className="save-check-label">{label}</span>
      </div>
    </div>
  );
}
