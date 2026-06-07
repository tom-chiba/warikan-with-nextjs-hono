"use client";

import { type FormEvent, useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";

type AuthMode = "signIn" | "signUp";

// 下線タブ（MainNav と同じエディトリアル・シャープの意匠）。モジュールレベルに置き再生成を避ける。
const tabClass = (active: boolean) =>
  `-mb-px border-b-3 px-1 pb-2 text-sm tracking-wide transition-colors ${
    active
      ? "border-ink font-extrabold text-ink"
      : "border-transparent font-bold text-muted hover:text-ink"
  }`;

// サインアップ/サインインのフォーム。セッション状態による出し分けは呼び出し側で行う。
// サインインに名前は不要なため、タブで画面を分けて名前フィールドの表示を出し分ける（#60）。
export function AuthPanel() {
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res =
      mode === "signUp"
        ? await signUp.email({ name, email, password })
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
  function switchMode(next: AuthMode) {
    if (next === mode) return;
    setMode(next);
    setError(null);
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col gap-3">
      <div role="tablist" aria-label="認証方法" className="flex gap-5 border-b border-rule">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signIn"}
          onClick={() => switchMode("signIn")}
          className={tabClass(mode === "signIn")}
        >
          サインイン
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signUp"}
          onClick={() => switchMode("signUp")}
          className={tabClass(mode === "signUp")}
        >
          サインアップ
        </button>
      </div>
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
        {mode === "signUp" ? "サインアップ" : "サインイン"}
      </button>
    </form>
  );
}
