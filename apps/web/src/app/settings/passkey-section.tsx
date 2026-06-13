"use client";

import { useState } from "react";
import { passkeyAuthClient } from "@/lib/passkey-client";
import { WEBAUTHN_CEREMONY_ABORTED, WEBAUTHN_PREVIOUSLY_REGISTERED } from "@/lib/passkey-errors";

const ADD_FAILED_MESSAGE = "パスキーの登録に失敗しました。";
const DELETE_FAILED_MESSAGE = "パスキーの削除に失敗しました。";

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
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleAdd() {
    setError(null);
    setSubmitting(true);
    try {
      const trimmed = name.trim();
      const res = await passkeyAuthClient.passkey.addPasskey(
        trimmed ? { name: trimmed } : undefined,
      );
      if (res?.error) {
        const code = "code" in res.error ? res.error.code : undefined;
        // ユーザーがダイアログを閉じた（= ERROR_CEREMONY_ABORTED）場合は無言で戻る。
        if (code === WEBAUTHN_CEREMONY_ABORTED) {
          return;
        }
        // すでに登録済みのパスキーを再登録しようとした場合は分かりやすく伝える。
        setError(
          code === WEBAUTHN_PREVIOUSLY_REGISTERED
            ? "このパスキーはすでに登録されています。"
            : ADD_FAILED_MESSAGE,
        );
        return;
      }
      // 成功。入力欄をリセットする（一覧は自動で再取得される）。
      setName("");
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
          className="field"
        />
        {error && <p className="note-danger">{error}</p>}
        <button
          type="button"
          onClick={handleAdd}
          disabled={submitting}
          className="btn btn-line self-start"
        >
          このデバイスにパスキーを追加
        </button>
      </div>
    </section>
  );
}
