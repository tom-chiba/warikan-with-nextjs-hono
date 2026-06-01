"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";
import { distributeEqually } from "@/lib/split";

// 入力欄の文字列を金額（非負整数）に変換する。未入力・不正値・負数は 0 とみなす。
function parseAmount(value: string | undefined): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// userId → 金額(円) の集計。
function totalOf(amounts: Record<string, string>, userIds: string[]): number {
  return userIds.reduce((sum, userId) => sum + parseAmount(amounts[userId]), 0);
}

export default function NewItemPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;
  const { data: session, isPending } = useSession();

  const [name, setName] = useState("");
  const [purchasedOn, setPurchasedOn] = useState("");
  const [memo, setMemo] = useState("");
  // 入力中の値は文字列で保持する（空欄と 0 を区別し、IME や前ゼロ等の編集を妨げない）。
  const [payments, setPayments] = useState<Record<string, string>>({});
  const [shares, setShares] = useState<Record<string, string>>({});
  const [equalSplit, setEqualSplit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // メンバー一覧（#7 の既存エンドポイント）。ログイン済みのときだけ取得する。
  const { data: membersData } = useQuery({
    queryKey: ["members", groupId],
    enabled: !!session,
    queryFn: async () => {
      const res = await apiClient.groups[":groupId"].members.$get({ param: { groupId } });
      if (!res.ok) {
        throw new Error("メンバー一覧の取得に失敗しました");
      }
      return res.json();
    },
  });

  const members = membersData?.members ?? [];
  const memberIds = members.map((m) => m.userId);
  const paymentTotal = totalOf(payments, memberIds);
  const shareTotal = totalOf(shares, memberIds);
  // メンバー集合が変わったとき（読み込み完了・等分対象の変化）に等分を追従させるためのキー。
  const memberKey = memberIds.join(",");

  // 等分スイッチ ON のとき、支払額合計・メンバーの変化に追従して割勘金額を等分入力する。
  // 端数のランダム振り分け結果はこの effect が走ったときだけ確定し、以降は state に保持されて
  // 再描画では変わらない（依存配列が変わらない限り再計算しない）。
  useEffect(() => {
    if (!equalSplit || memberIds.length === 0) {
      return;
    }
    const distributed = distributeEqually(paymentTotal, memberIds);
    setShares(
      Object.fromEntries(Object.entries(distributed).map(([id, amount]) => [id, String(amount)])),
    );
    // 依存は memberIds の参照ではなく memberKey（内容）で判定する。
    // memberIds は paymentTotal / memberKey の計算元なので、両者が同値なら再計算は不要。
  }, [equalSplit, paymentTotal, memberKey]);

  if (isPending) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <p className="text-zinc-500">セッション確認中…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <p>このページを利用するにはサインインが必要です。</p>
        <Link href="/" className="rounded-md border px-4 py-2">
          サインインへ
        </Link>
      </main>
    );
  }

  // 支払額を変更する。等分 ON のときは effect が割勘へ追従する。
  function handlePaymentChange(userId: string, value: string) {
    setSaved(false);
    setPayments((prev) => ({ ...prev, [userId]: value }));
  }

  // 割勘金額の手入力。等分の自動入力を上書きする意思表示とみなし、等分スイッチを OFF にする。
  function handleShareChange(userId: string, value: string) {
    setSaved(false);
    setEqualSplit(false);
    setShares((prev) => ({ ...prev, [userId]: value }));
  }

  // 「残りをここに」: 不足分（支払額合計 − 現在の割勘金額合計）を対象メンバーへ加算する。
  // 手動調整なので等分スイッチは OFF にする。結果が負になる場合は 0 で止める。
  function handleFillRemainder(userId: string) {
    const deficit = paymentTotal - shareTotal;
    if (deficit === 0) {
      return;
    }
    setSaved(false);
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
    setSaved(false);
    setSubmitting(true);
    try {
      // 金額 > 0 のメンバー行だけ送る（0 円は保存しない仕様）。
      const toEntries = (amounts: Record<string, string>) =>
        memberIds
          .map((userId) => ({ userId, amount: parseAmount(amounts[userId]) }))
          .filter((e) => e.amount > 0);

      const res = await apiClient.groups[":groupId"].items.$post({
        param: { groupId },
        json: {
          name: name.trim(),
          purchasedOn: purchasedOn || null,
          memo: memo.trim() || null,
          payments: toEntries(payments),
          shares: toEntries(shares),
        },
      });
      if (!res.ok) {
        const status: number = res.status;
        throw new Error(
          status === 401
            ? "セッションが切れました。再度サインインしてください。"
            : "購入品の保存に失敗しました",
        );
      }
      // 連続入力のため、入力欄をリセットして同じページに留まる。
      setName("");
      setPurchasedOn("");
      setMemo("");
      setPayments({});
      setShares({});
      setEqualSplit(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "購入品の保存に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  const deficit = paymentTotal - shareTotal;

  return (
    <main className="flex flex-1 flex-col items-center gap-8 p-8">
      <h1 className="text-2xl font-semibold">購入品を入力</h1>

      <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-6">
        {/* 基本情報（#14） */}
        <section className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">購入品名</span>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => {
                setSaved(false);
                setName(e.target.value);
              }}
              placeholder="例: ランチ"
              className="rounded-md border px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">購入日（任意）</span>
            <input
              type="date"
              value={purchasedOn}
              onChange={(e) => {
                setSaved(false);
                setPurchasedOn(e.target.value);
              }}
              className="rounded-md border px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">メモ（任意）</span>
            <textarea
              value={memo}
              onChange={(e) => {
                setSaved(false);
                setMemo(e.target.value);
              }}
              placeholder="補足があれば"
              className="rounded-md border px-3 py-2"
            />
          </label>
        </section>

        {members.length === 0 ? (
          <p className="text-sm text-zinc-500">メンバーを読み込み中…</p>
        ) : (
          <>
            {/* 支払額（#15） */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium">支払額</h2>
                <span className="text-sm text-zinc-500">合計 {paymentTotal} 円</span>
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
                      className="w-32 rounded-md border px-3 py-2 text-right"
                    />
                  </li>
                ))}
              </ul>
            </section>

            {/* 割勘金額（#16, #17） */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium">割勘金額</h2>
                <span className="text-sm text-zinc-500">合計 {shareTotal} 円</span>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={equalSplit}
                  onChange={(e) => {
                    setSaved(false);
                    setEqualSplit(e.target.checked);
                  }}
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
                        className="w-32 rounded-md border px-3 py-2 text-right"
                      />
                      <button
                        type="button"
                        disabled={deficit === 0}
                        onClick={() => handleFillRemainder(m.userId)}
                        className="rounded-md border px-2 py-1 text-xs disabled:opacity-40"
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
                <p className="text-sm text-amber-600">
                  支払額合計との差: {deficit > 0 ? `不足 ${deficit}` : `超過 ${-deficit}`} 円
                </p>
              )}
            </section>
          </>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}
        {saved && <p className="text-sm text-green-600">保存しました。続けて入力できます。</p>}

        <button
          type="submit"
          disabled={submitting || !canSubmit}
          className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          保存
        </button>
      </form>

      <Link href={`/groups/${groupId}`} className="rounded-md border px-4 py-2">
        グループへ戻る
      </Link>
    </main>
  );
}
