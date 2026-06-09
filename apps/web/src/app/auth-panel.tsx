"use client";

import Link from "next/link";
import { type FormEvent, type KeyboardEvent, useRef, useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";

type AuthMode = "signIn" | "signUp";

const TAB_ORDER = ["signIn", "signUp"] as const;

const TAB_LABELS: Record<AuthMode, string> = {
  signIn: "サインイン",
  signUp: "サインアップ",
};

// キー判定用の Set。キー押下ごとの配列生成と O(n) 走査を避ける。
const TABLIST_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

// サインアップ/サインインのフォーム。セッション状態による出し分けは呼び出し側で行う。
// サインインに名前は不要なため、タブで画面を分けて名前フィールドの表示を出し分ける（#60）。
// defaultMode: 新規ユーザーが主な流入元（招待リンク等）ではサインアップを初期表示にする。
export function AuthPanel({ defaultMode = "signIn" }: { defaultMode?: AuthMode } = {}) {
  const [mode, setMode] = useState<AuthMode>(defaultMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const tabRefs = useRef<Record<AuthMode, HTMLButtonElement | null>>({
    signIn: null,
    signUp: null,
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    // HTML required は空白のみを通すため、trim して中身があることを確認する。
    const trimmedName = name.trim();
    if (mode === "signUp" && !trimmedName) {
      setError("名前を入力してください");
      return;
    }
    setSubmitting(true);
    const res =
      mode === "signUp"
        ? await signUp.email({ name: trimmedName, email, password })
        : await signIn.email({ email, password });
    if (res.error) {
      setError(
        res.error.message ??
          (mode === "signUp" ? "サインアップに失敗しました" : "サインインに失敗しました"),
      );
    }
    setSubmitting(false);
  }

  // タブ切替時は前モードのエラーを引き継がない（入力値は再入力の手間を省くため保持する）。
  // 送信中は切り替えない: 在庫中の結果（エラー表示・submitting 解除）が別タブの下に出るのを防ぐ。
  function switchMode(next: AuthMode) {
    if (next === mode || submitting) return;
    setMode(next);
    setError(null);
  }

  // WAI-ARIA タブパターンのキーボード操作。2 タブなので左右どちらの矢印でももう一方へ移す。
  function handleTablistKeyDown(e: KeyboardEvent) {
    if (!TABLIST_KEYS.has(e.key)) return;
    e.preventDefault();
    const next: AuthMode =
      e.key === "Home"
        ? "signIn"
        : e.key === "End"
          ? "signUp"
          : mode === "signIn"
            ? "signUp"
            : "signIn";
    switchMode(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col gap-3">
      <div
        role="tablist"
        aria-label="認証方法"
        onKeyDown={handleTablistKeyDown}
        className="flex gap-5 border-b border-rule"
      >
        {TAB_ORDER.map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            id={`auth-tab-${m}`}
            aria-selected={mode === m}
            aria-controls="auth-tabpanel"
            aria-disabled={submitting}
            tabIndex={mode === m ? 0 : -1}
            ref={(el) => {
              tabRefs.current[m] = el;
            }}
            onClick={() => switchMode(m)}
            className={mode === m ? "tab tab-active" : "tab"}
          >
            {TAB_LABELS[m]}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="auth-tabpanel"
        aria-labelledby={`auth-tab-${mode}`}
        className="flex flex-col gap-3"
      >
        {mode === "signUp" && (
          <input
            type="text"
            aria-label="名前"
            placeholder="名前"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field"
          />
        )}
        <input
          type="email"
          aria-label="メールアドレス"
          placeholder="メールアドレス"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field"
        />
        <input
          type="password"
          aria-label="パスワード"
          placeholder="パスワード"
          // 画面を分けたことでモードごとに意味づけできる。パスワードマネージャの提案が適切になる。
          autoComplete={mode === "signUp" ? "new-password" : "current-password"}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field"
        />
        {error && <p className="note-danger">{error}</p>}
        <button type="submit" disabled={submitting} className="btn btn-fill">
          {TAB_LABELS[mode]}
        </button>
        {/* パスワード再設定への導線（#68）。名前が不要なサインイン時にのみ示す。 */}
        {mode === "signIn" && (
          <Link href="/forgot-password" className="self-start text-sm text-muted underline">
            パスワードをお忘れですか？
          </Link>
        )}
      </div>
    </form>
  );
}
