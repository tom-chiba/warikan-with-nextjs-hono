"use client";

import Link from "next/link";
import { type FormEvent, type KeyboardEvent, useRef, useState } from "react";
import { sendVerificationEmail, signIn, signUp } from "@/lib/auth-client";

type AuthMode = "signIn" | "signUp";

const TAB_ORDER = ["signIn", "signUp"] as const;

const TAB_LABELS: Record<AuthMode, string> = {
  signIn: "サインイン",
  signUp: "サインアップ",
};

// キー判定用の Set。キー押下ごとの配列生成と O(n) 走査を避ける。
const TABLIST_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

// 確認メール内リンクの遷移先（#69）。検証後はこの /verify-email に着地し、成功・失敗を表示する。
// 検証メールの url は ${API}/api/auth/verify-email?token=...&callbackURL=<ここ> の形になる。
function verifyEmailCallbackURL(): string {
  return `${window.location.origin}/verify-email`;
}

// サインアップ/サインインのフォーム。サインイン成功時のセッション反映による出し分けは呼び出し側で行う。
// サインインに名前は不要なため、タブで画面を分けて名前フィールドの表示を出し分ける（#60）。
// サインアップは #69 のメール検証導入により成功してもセッションは張られない（仮登録）。そのため
// 成功後はこのコンポーネント内で「確認メールを送信しました」表示に切り替える。
// defaultMode: 新規ユーザーが主な流入元（招待リンク等）ではサインアップを初期表示にする。
export function AuthPanel({ defaultMode = "signIn" }: { defaultMode?: AuthMode } = {}) {
  const [mode, setMode] = useState<AuthMode>(defaultMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // サインアップ成功後の「確認メールを送信しました」表示（仮登録状態）。
  const [signedUp, setSignedUp] = useState(false);
  // 未検証のままサインインを試みた（403 EMAIL_NOT_VERIFIED）。再送ボタンを示す。
  const [needsVerification, setNeedsVerification] = useState(false);
  // 確認メールの明示的な再送の進行状態と完了表示。
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const tabRefs = useRef<Record<AuthMode, HTMLButtonElement | null>>({
    signIn: null,
    signUp: null,
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNeedsVerification(false);
    setResent(false);
    // HTML required は空白のみを通すため、trim して中身があることを確認する。
    const trimmedName = name.trim();
    if (mode === "signUp" && !trimmedName) {
      setError("名前を入力してください");
      return;
    }
    setSubmitting(true);
    const res =
      mode === "signUp"
        ? await signUp.email({
            name: trimmedName,
            email,
            password,
            // 検証リンク踏破後の着地先。期限切れ等は ?error= 付きでここへ戻る。
            callbackURL: verifyEmailCallbackURL(),
          })
        : await signIn.email({ email, password });
    if (res.error) {
      // 未検証ユーザーのサインインは 403。Better Auth は sendOnSignIn で確認メールを自動再送するため、
      // その旨を案内しつつ、届かない場合に備えて明示的な再送ボタンも出す。
      if (mode === "signIn" && res.error.code === "EMAIL_NOT_VERIFIED") {
        setError(
          "メールアドレスの確認が完了していません。確認用メールを送り直しましたので、メール内のリンクから確認してください。",
        );
        setNeedsVerification(true);
      } else {
        setError(
          res.error.message ??
            (mode === "signUp" ? "サインアップに失敗しました" : "サインインに失敗しました"),
        );
      }
      setSubmitting(false);
      return;
    }
    // サインアップは成功してもセッションが張られない（仮登録）。確認メール送信済みの表示に切り替える。
    // サインインの成功はセッションが張られ、呼び出し側（page.tsx）がログイン後 UI を描画する。
    if (mode === "signUp") {
      setSignedUp(true);
    }
    setSubmitting(false);
  }

  // 確認メールを再送する。サインアップ直後・未検証サインイン後のいずれからも使う。
  // 列挙対策として成否で表示を変えず、試行後は常に同じ完了文言を出す。
  async function handleResend() {
    setResending(true);
    setResent(false);
    try {
      await sendVerificationEmail({ email: email.trim(), callbackURL: verifyEmailCallbackURL() });
    } catch {
      // ネットワーク断等。中立表示を保つため、ここでは握りつぶす。
    }
    setResent(true);
    setResending(false);
  }

  // タブ切替時は前モードのエラー・状態を引き継がない（入力値は再入力の手間を省くため保持する）。
  // 送信中は切り替えない: 在庫中の結果（エラー表示・submitting 解除）が別タブの下に出るのを防ぐ。
  function switchMode(next: AuthMode) {
    if (next === mode || submitting) return;
    setMode(next);
    setError(null);
    setSignedUp(false);
    setNeedsVerification(false);
    setResent(false);
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

  // サインアップ成功後の確認メール送信済み表示（仮登録状態）。
  // forgot-password の送信完了表示と同じく、フォームを隠して次の操作（メール確認）へ誘導する。
  if (signedUp) {
    return (
      <div className="flex w-full max-w-xs flex-col gap-4">
        <p className="note-ok">
          確認メールを送信しました。メール内のリンクをクリックすると登録が完了し、サインインできるようになります。
        </p>
        <p className="note-muted">
          メールが届かない場合は、迷惑メールフォルダをご確認のうえ、下のボタンから再送してください。
        </p>
        {resent && <p className="note-ok">確認メールを再送しました。</p>}
        <button type="button" onClick={handleResend} disabled={resending} className="btn btn-line">
          確認メールを再送
        </button>
        <button
          type="button"
          onClick={() => switchMode("signIn")}
          className="link-quiet self-start"
        >
          サインインへ戻る
        </button>
      </div>
    );
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
        {/* 未検証サインイン時の明示的な再送導線（#69）。自動再送に加え、届かない場合に手動再送できる。 */}
        {needsVerification && (
          <>
            {resent && <p className="note-ok">確認メールを再送しました。</p>}
            <button
              type="button"
              onClick={handleResend}
              disabled={resending || email.trim().length === 0}
              className="btn btn-line"
            >
              確認メールを再送
            </button>
          </>
        )}
        <button type="submit" disabled={submitting} className="btn btn-fill">
          {TAB_LABELS[mode]}
        </button>
        {/* パスワード再設定への導線（#68）。名前が不要なサインイン時にのみ示す。 */}
        {mode === "signIn" && (
          <Link href="/forgot-password" className="link-quiet self-start">
            パスワードをお忘れですか？
          </Link>
        )}
      </div>
    </form>
  );
}
