"use client";

import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { distributeEqually } from "@warikan/domain";
import { todayLocal } from "@/lib/date";
import { formatAmount } from "@/lib/format";

// 購入品の入力フォーム（新規 #4 / 編集 #20 で共通利用）。
// 支払額・割勘金額の入力、等分、「残りをここに」、合計・過不足表示、保存可否の判定を内包する。
// 保存処理そのもの（POST / PUT・遷移）は onSubmit に委ね、本コンポーネントは入力と検証に専念する。

export type Member = { userId: string; name: string };

// onSubmit に渡す正規化済みの値。payments / shares は金額 > 0 の行だけを含む。
export type ItemFormValues = {
  name: string;
  purchasedOn: string | null;
  memo: string | null;
  payments: { userId: string; amount: number }[];
  shares: { userId: string; amount: number }[];
};

// プリフィル用の初期値。金額は入力欄に合わせて userId → 文字列で持つ。
export type ItemFormInitial = {
  name: string;
  purchasedOn: string;
  memo: string;
  payments: Record<string, string>;
  shares: Record<string, string>;
};

type ItemFormProps = {
  members: Member[];
  initial?: ItemFormInitial;
  submitLabel: string;
  // 成功後にフォームを初期化して同じ画面に留まるか（新規の連続入力 = true、編集 = false）。
  resetAfterSubmit?: boolean;
  // 成功時に表示するメッセージ（任意）。指定した画面でのみ完了フィードバックのチェックを出す。
  successMessage?: string;
  // 購入日が選択されているときに、購入日欄の直下へ差し込む任意の注記。
  // 「この日にもう入力済みか」の確認表示などに使う（取得・表示は呼び出し側に委ね、本体には依存を持たせない）。
  renderPurchasedOnNote?: (purchasedOn: string) => ReactNode;
  onSubmit: (values: ItemFormValues) => Promise<void>;
};

// 保存成功時に画面中央で一瞬だけ出す完了フィードバック（購入完了フィードバック案 1b）。
// 親側が保存のたびに key を変えて再マウントすることでエントランスを再生する。マウントから約 0.7 秒後に
// フェードアウトし、フェード（0.4 秒）後に DOM から外れる。日常の連続入力を妨げないよう、フェード中は
// タップを透過させ、表示中はタップで即座に閉じられるようにする。
function SaveCheck({ label }: { label: string }) {
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
    // 自動で消える一時的な確認表示。タップは早閉じの補助操作で、キーボード操作の対象にはしない。
    <div
      onClick={fading ? undefined : () => setPhase("fading")}
      className="save-check-backdrop"
      style={{ opacity: fading ? 0 : 1, pointerEvents: fading ? "none" : "auto" }}
      aria-hidden={fading}
    >
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

// 入力欄の文字列を金額（正の整数・円）に変換する。未入力・小数・負数・0・非数値は 0 とみなす。
// type="number" は "1e2"（=100）等の指数表記を有効値として返すため、parseInt ではなく Number で
// 数値全体を解釈する（parseInt だと "1e2" を 1 と誤読する）。小数は Number.isInteger で弾く。
function parseAmount(value: string | undefined): number {
  const n = Number(value ?? "");
  return Number.isInteger(n) && n > 0 ? n : 0;
}

// userId → 金額(円) の集計。
function totalOf(amounts: Record<string, string>, userIds: string[]): number {
  return userIds.reduce((sum, userId) => sum + parseAmount(amounts[userId]), 0);
}

const EMPTY: Record<string, string> = {};

export function ItemForm({
  members,
  initial,
  submitLabel,
  resetAfterSubmit = false,
  successMessage,
  renderPurchasedOnNote,
  onSubmit,
}: ItemFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  // 新規入力（initial なし）では購入日のデフォルトを今日にする。購入品の多くは入力当日のものなので
  // 入力ステップを 1 つ減らせる。編集時は保存済みの購入日をそのまま使う（等分の !initial と同じ考え方）。
  const [purchasedOn, setPurchasedOn] = useState(initial?.purchasedOn ?? todayLocal());
  const [memo, setMemo] = useState(initial?.memo ?? "");
  // 入力中の値は文字列で保持する（空欄と 0 を区別し、IME や前ゼロ等の編集を妨げない）。
  const [payments, setPayments] = useState<Record<string, string>>(initial?.payments ?? EMPTY);
  const [shares, setShares] = useState<Record<string, string>>(initial?.shares ?? EMPTY);
  // 等分は新規入力ではデフォルト ON（固定メンバーの日常入力では等分が大半のため）。
  // 編集時（initial あり）は保存済みの割勘金額を等分で上書きしないよう OFF で始める。
  const [equalSplit, setEqualSplit] = useState(!initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 保存成功のたびに増やす連番。SaveCheck のフィードバック再生トリガーに使う（真偽値だと連続保存で
  // 同じ値のままになり再生されないため、増分するカウンタにする）。
  const [savedTick, setSavedTick] = useState(0);

  const memberIds = members.map((m) => m.userId);
  const paymentTotal = totalOf(payments, memberIds);
  const shareTotal = totalOf(shares, memberIds);
  const deficit = paymentTotal - shareTotal;

  // 等分の割勘金額を計算して shares に反映する。端数のランダム振り分け結果はこの呼び出し時点で
  // 確定し、以降は state に保持されて再描画では変わらない（等分 ON 化・支払額変更などの操作時のみ
  // 再計算する。effect ではなくイベントで行うことで余分な再レンダーと依存追従ロジックを避ける）。
  function applyEqualSplit(paymentsForCalc: Record<string, string>) {
    const distributed = distributeEqually(totalOf(paymentsForCalc, memberIds), memberIds);
    setShares(
      Object.fromEntries(Object.entries(distributed).map(([id, amount]) => [id, String(amount)])),
    );
  }

  // 支払額を変更する。等分 ON のときは新しい支払額合計で割勘を再計算して追従させる。
  function handlePaymentChange(userId: string, value: string) {
    const next = { ...payments, [userId]: value };
    setPayments(next);
    if (equalSplit) {
      applyEqualSplit(next);
    }
  }

  // 割勘金額の手入力。等分の自動入力を上書きする意思表示とみなし、等分スイッチを OFF にする。
  function handleShareChange(userId: string, value: string) {
    setEqualSplit(false);
    setShares((prev) => ({ ...prev, [userId]: value }));
  }

  // 等分スイッチの切り替え。ON にした時点で現在の支払額合計を等分して割勘へ反映する。
  // OFF にしたら等分で自動入力された割勘を破棄し、手入力をまっさらな状態から始められるようにする
  // （割勘欄の手入力や「残りをここに」による自動 OFF は手動調整の継続なのでクリアしない）。
  function handleEqualSplitToggle(checked: boolean) {
    setEqualSplit(checked);
    if (checked) {
      applyEqualSplit(payments);
    } else {
      setShares(EMPTY);
    }
  }

  // 「残りをここに」: 不足分（支払額合計 − 現在の割勘金額合計）を対象メンバーへ加算する。
  // 手動調整なので等分スイッチは OFF にする。結果が負になる場合は 0 で止める。
  function handleFillRemainder(userId: string) {
    if (deficit === 0) {
      return;
    }
    setEqualSplit(false);
    setShares((prev) => {
      const next = Math.max(0, parseAmount(prev[userId]) + deficit);
      return { ...prev, [userId]: String(next) };
    });
  }

  const nameValid = name.trim().length > 0;
  // 保存可能条件: 品名あり・支払額合計 > 0・支払額合計 = 割勘金額合計。
  const canSubmit = nameValid && paymentTotal > 0 && paymentTotal === shareTotal;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // 金額 > 0 のメンバー行だけ送る（0 円は保存しない仕様）。
      const toEntries = (amounts: Record<string, string>) =>
        memberIds
          .map((userId) => ({ userId, amount: parseAmount(amounts[userId]) }))
          .filter((entry) => entry.amount > 0);

      await onSubmit({
        name: name.trim(),
        purchasedOn: purchasedOn || null,
        memo: memo.trim() || null,
        payments: toEntries(payments),
        shares: toEntries(shares),
      });

      if (resetAfterSubmit) {
        setName("");
        setPurchasedOn(todayLocal());
        setMemo("");
        setPayments(EMPTY);
        setShares(EMPTY);
        setEqualSplit(true);
      }
      // 完了フィードバック（SaveCheck）を再生する。連続保存でも毎回再生されるよう連番を進める。
      setSavedTick((tick) => tick + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-6">
      <section className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">購入品名</span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: ランチ"
            className="field"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">購入日（任意）</span>
          <input
            type="date"
            value={purchasedOn}
            onChange={(e) => setPurchasedOn(e.target.value)}
            className="field"
          />
        </label>
        {/* 購入日が選択されているときだけ、呼び出し側が渡す注記（重複入力の確認など）を差し込む。 */}
        {purchasedOn && renderPurchasedOnNote?.(purchasedOn)}
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">メモ（任意）</span>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="補足があれば"
            className="field"
          />
        </label>
      </section>

      {members.length === 0 ? (
        <p className="note-muted">メンバーを読み込み中…</p>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <div className="section-rule flex items-baseline justify-between">
              <h2 className="section-title">支払額</h2>
              <span className="text-sm font-bold tabular-nums">
                合計 {formatAmount(paymentTotal)} 円
              </span>
            </div>
            <ul className="flex flex-col gap-2">
              {members.map((m) => (
                <li key={m.userId} className="flex items-center justify-between gap-3">
                  <span className="truncate">{m.name}</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    aria-label={`${m.name} の支払額`}
                    value={payments[m.userId] ?? ""}
                    onChange={(e) => handlePaymentChange(m.userId, e.target.value)}
                    className="field w-32 text-right tabular-nums"
                  />
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-3">
            <div className="section-rule flex items-baseline justify-between">
              <h2 className="section-title">割勘金額</h2>
              <span className="text-sm font-bold tabular-nums">
                合計 {formatAmount(shareTotal)} 円
              </span>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-accent"
                checked={equalSplit}
                onChange={(e) => handleEqualSplitToggle(e.target.checked)}
              />
              <span>等分（支払額合計を人数で等分し、端数は自動で振り分け）</span>
            </label>
            <ul className="flex flex-col gap-2">
              {members.map((m) => (
                <li key={m.userId} className="flex items-center justify-between gap-3">
                  <span className="truncate">{m.name}</span>
                  <span className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      aria-label={`${m.name} の割勘金額`}
                      value={shares[m.userId] ?? ""}
                      onChange={(e) => handleShareChange(m.userId, e.target.value)}
                      className="field w-32 text-right tabular-nums"
                    />
                    <button
                      type="button"
                      // 不足（deficit > 0）のときだけ活性。一致・超過時は「残りを加算」の意味を持たないため無効。
                      disabled={deficit <= 0}
                      onClick={() => handleFillRemainder(m.userId)}
                      className="btn btn-line btn-sm shrink-0"
                      title="不足分をこのメンバーに加算"
                    >
                      残りをここに
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            {/* 過不足の表示。0 なら一致。 */}
            {deficit !== 0 && (
              <p className="text-sm font-medium tabular-nums text-warn">
                支払額合計との差: {deficit > 0 ? `不足 ${deficit}` : `超過 ${-deficit}`} 円
              </p>
            )}
          </section>
        </>
      )}

      {error && <p className="note-danger">{error}</p>}

      <button type="submit" disabled={submitting || !canSubmit} className="btn btn-fill w-full">
        {submitLabel}
      </button>

      {/* 保存成功の完了フィードバック。successMessage を指定した画面（連続入力）でのみ表示する。
          savedTick を key にして保存のたびに再マウントし、エントランスのアニメーションを再生する。 */}
      {successMessage && savedTick > 0 && <SaveCheck key={savedTick} label={successMessage} />}
    </form>
  );
}
