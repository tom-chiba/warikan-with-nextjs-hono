"use client";

import { useState } from "react";
import { authClient, refreshSession, useSession } from "@/lib/auth-client";
import { passkeyAuthClient } from "@/lib/passkey-client";
import {
  SESSION_NOT_FRESH,
  WEBAUTHN_CEREMONY_ABORTED,
  WEBAUTHN_PREVIOUSLY_REGISTERED,
} from "@/lib/passkey-errors";

const ADD_FAILED_MESSAGE = "パスキーの登録に失敗しました。";
const DELETE_FAILED_MESSAGE = "パスキーの削除に失敗しました。";
const REAUTH_FAILED_MESSAGE = "パスワードが正しくありません。";

// addPasskey 1 回分の結果。SESSION_NOT_FRESH（#105）はパスワード再認証フローへ誘導するため
// 他のエラーと区別する。aborted はユーザーがダイアログを閉じただけなので無言で戻る。
type AddResult =
  | { status: "ok" }
  | { status: "aborted" }
  | { status: "stale-session" }
  | { status: "error"; message: string };

// addPasskey を 1 回試行し、結果を分類して返す。
async function addPasskeyOnce(name: string): Promise<AddResult> {
  const trimmed = name.trim();
  const res = await passkeyAuthClient.passkey.addPasskey(trimmed ? { name: trimmed } : undefined);
  if (res?.error) {
    const code = "code" in res.error ? res.error.code : undefined;
    if (code === WEBAUTHN_CEREMONY_ABORTED) {
      return { status: "aborted" };
    }
    if (code === SESSION_NOT_FRESH) {
      return { status: "stale-session" };
    }
    return {
      status: "error",
      message:
        code === WEBAUTHN_PREVIOUSLY_REGISTERED
          ? "このパスキーはすでに登録されています。"
          : ADD_FAILED_MESSAGE,
    };
  }
  return { status: "ok" };
}

// 設定画面のパスキー管理セクション（#90）。ログイン済みユーザーが自分の user.id に紐づくパスキーを
// 登録・一覧・削除する。registration.requireSession（既定 true）により、ここでの登録は常に
// 現在ログイン中のアカウントへの後付け紐づけになる。
//
// このコンポーネントは @simplewebauthn/browser を静的 import する passkey-client に依存するため、
// settings/page.tsx からは next/dynamic（ssr:false）で遅延読み込みする（初期バンドルに乗せない）。
//
// 一覧（useListPasskeys）はパスキークライアントの atom 連動フックで、追加（addPasskey）・削除
// （deletePasskey）の成功後は atomListeners により自動で再取得される。
export function PasskeySection() {
  const { data: passkeys, isPending, error: listError } = passkeyAuthClient.useListPasskeys();
  const { data: session } = useSession();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // セッション鮮度切れ（#105）でパスワード再認証を求めている間だけ true。再認証 UI を表示する。
  const [reauthRequired, setReauthRequired] = useState(false);
  const [password, setPassword] = useState("");

  // 共通の後始末（成功時）。入力欄と再認証 UI を畳む（一覧は自動で再取得される）。
  function finishSuccess() {
    setName("");
    setPassword("");
    setReauthRequired(false);
  }

  async function handleAdd() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await addPasskeyOnce(name);
      switch (result.status) {
        case "ok":
          finishSuccess();
          return;
        case "aborted":
          // ユーザーがダイアログを閉じただけ。無言で戻る。
          return;
        case "stale-session":
          // freshAge 切れ（#105）。パスワード再入力 UI を出し、再認証後に再試行する。
          setReauthRequired(true);
          return;
        case "error":
          setError(result.message);
          return;
      }
    } catch {
      setError(ADD_FAILED_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  }

  // 再認証して登録をやり直す（#105）。共有 authClient でパスワード再ログインして新しいセッション
  //（createdAt リセット）を作り直し、同一 api オリジンの cookie 共有を介して passkeyAuthClient の
  // 次の addPasskey にそのフレッシュなセッションを乗せる。
  async function handleReauth() {
    const email = session?.user.email;
    if (!email || !password) {
      setError(REAUTH_FAILED_MESSAGE);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const signInRes = await authClient.signIn.email({ email, password });
      if (signInRes?.error) {
        setError(REAUTH_FAILED_MESSAGE);
        return;
      }
      // 共有クライアントの nanostore を駆動して UI のセッション表示も最新化する。
      refreshSession();
      const result = await addPasskeyOnce(name);
      switch (result.status) {
        case "ok":
          finishSuccess();
          return;
        case "aborted":
          // ダイアログを閉じただけ。再認証 UI は閉じ、パスワードは消す。
          setPassword("");
          setReauthRequired(false);
          return;
        case "stale-session":
          // 再認証直後でも fresh と見なされない異常時。汎用エラーにフォールバックする。
          setError(ADD_FAILED_MESSAGE);
          return;
        case "error":
          setError(result.message);
          return;
      }
    } catch {
      setError(ADD_FAILED_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("このパスキーを削除します。よろしいですか？")) {
      return;
    }
    setError(null);
    setDeletingId(id);
    try {
      const res = await passkeyAuthClient.passkey.deletePasskey({ id });
      if (res?.error) {
        setError(DELETE_FAILED_MESSAGE);
      }
    } catch {
      setError(DELETE_FAILED_MESSAGE);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="flex w-full flex-col gap-3">
      <h2 className="section-title section-rule">パスキー</h2>
      <p className="note-muted">
        パスキー（生体認証など）を登録すると、次回からメールアドレスとパスワードの入力なしでログインできます。複数の端末でそれぞれ登録できます。
      </p>

      {isPending && <p className="note-muted">パスキーを読み込み中…</p>}
      {listError && <p className="note-danger">パスキーの取得に失敗しました。</p>}

      {passkeys && passkeys.length > 0 && (
        <ul className="flex flex-col gap-2">
          {passkeys.map((pk) => (
            <li key={pk.id} className="flex items-center justify-between gap-3">
              <span className="text-sm">
                <span className="font-bold">{pk.name || "パスキー"}</span>
                {pk.createdAt && (
                  <span className="note-muted ml-2">
                    {new Date(pk.createdAt).toLocaleDateString("ja-JP")} 登録
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(pk.id)}
                disabled={deletingId === pk.id}
                className="link-quiet text-danger"
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <input
          type="text"
          aria-label="パスキーの名前（任意）"
          placeholder="パスキーの名前（任意・例: iPhone）"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={reauthRequired}
          className="field"
        />
        {/* セッション鮮度切れ（#105）。最後のログインから時間が経っているため、本人確認として
            パスワードの再入力を求める。再認証に成功するとそのまま登録を続行する。 */}
        {reauthRequired && (
          <div className="flex flex-col gap-2">
            <p className="note-muted">
              安全のため、パスキーを登録する前にパスワードをもう一度入力してください。
            </p>
            <input
              type="password"
              aria-label="パスワード"
              placeholder="パスワード"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field"
            />
          </div>
        )}
        {error && <p className="note-danger">{error}</p>}
        <button
          type="button"
          onClick={reauthRequired ? handleReauth : handleAdd}
          disabled={submitting}
          className="btn btn-line self-start"
        >
          {reauthRequired ? "再認証してパスキーを追加" : "このデバイスにパスキーを追加"}
        </button>
      </div>
    </section>
  );
}
