"use client";

import { type FormEvent, useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";

// サインアップ/サインインのフォーム。セッション状態による出し分けは呼び出し側で行う。
export function AuthPanel() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSignUp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await signUp.email({ name, email, password });
    if (res.error) setError(res.error.message ?? "サインアップに失敗しました");
    setSubmitting(false);
  }

  async function handleSignIn() {
    setError(null);
    setSubmitting(true);
    const res = await signIn.email({ email, password });
    if (res.error) setError(res.error.message ?? "サインインに失敗しました");
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSignUp} className="flex w-full max-w-xs flex-col gap-3">
      <input
        type="text"
        aria-label="名前"
        placeholder="名前"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-md border px-3 py-2"
      />
      <input
        type="email"
        aria-label="メールアドレス"
        placeholder="メールアドレス"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-md border px-3 py-2"
      />
      <input
        type="password"
        aria-label="パスワード"
        placeholder="パスワード"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded-md border px-3 py-2"
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          サインアップ
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={handleSignIn}
          className="rounded-md border px-4 py-2 disabled:opacity-50"
        >
          サインイン
        </button>
      </div>
    </form>
  );
}
