"use client";

import { useState } from "react";
import { WEBAUTHN_CEREMONY_ABORTED } from "@/lib/passkey-errors";

// 失敗時の中立的な案内（API エラー・例外のどちらの経路でも同じ文言にする）。
const SIGN_IN_FAILED_MESSAGE =
  "パスキーでのログインに失敗しました。パスワードでのログインをお試しください。";

// パスキー（WebAuthn）でのログインボタン（#90）。メール+パスワードと併存する第 2 のログイン手段。
//
// パフォーマンス方針（CLAUDE.md）: パスキークライアントは @simplewebauthn/browser を静的 import する
// 重い依存のため、ここでは静的に持たず、クリック時に動的 import() する。これによりルート / の初期
// バンドル（最高頻度のクイック入力画面）に simplewebauthn が乗らない。このボタン自体は軽量なので
// auth-panel から静的に取り込んでよい。
//
// サインイン成功後はセッション cookie が同一 api オリジンに張られる。useSession を駆動するのは共有
// authClient の nanostore のため、refreshSession() で能動的に再取得させ、page.tsx をログイン後 UI へ
// 再描画させる（別クライアント経由のサインインでは自動反映されないため）。
export function PasskeySignInButton() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setSubmitting(true);
    try {
      const { passkeyAuthClient } = await import("@/lib/passkey-client");
      const { refreshSession } = await import("@/lib/auth-client");
      const res = await passkeyAuthClient.signIn.passkey();
      if (res?.error) {
        // ユーザーがダイアログを閉じた／タイムアウト（= ERROR_CEREMONY_ABORTED）はエラー表示しない。
        // 登録済みパスキーが無い・認証失敗などはまとめて中立的な案内にする（パスワードログインへ誘導）。
        if ("code" in res.error && res.error.code === WEBAUTHN_CEREMONY_ABORTED) {
          return;
        }
        setError(SIGN_IN_FAILED_MESSAGE);
        return;
      }
      refreshSession();
    } catch {
      // ブラウザがキャンセルや未対応で例外を投げるケース。中立的な案内にとどめる。
      setError(SIGN_IN_FAILED_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={handleClick} disabled={submitting} className="btn btn-line">
        パスキーでログイン
      </button>
      {error && <p className="note-danger">{error}</p>}
    </div>
  );
}
