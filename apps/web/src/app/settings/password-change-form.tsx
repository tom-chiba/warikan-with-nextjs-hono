"use client";

import { type FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { passwordRuleErrorMessage } from "@/lib/auth-error";

// 設定ページのパスワード行 + インライン変更フォーム（#61）。
// 編集中フラグ・入力値・エラー/成功は行内の関心事なのでここに閉じ込め、
// ページ側は設定ハブの構成に集中させる（#64 の MemberRow と同じ方針）。
export function PasswordChangeForm() {
  const [editing, setEditing] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function startEditing() {
    // 開くたびに空の入力から始める（前回の入力値・エラー・成功表示を持ち越さない）。
    setCurrentPassword("");
    setNewPassword("");
    setError(null);
    setSuccess(false);
    setEditing(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await authClient.changePassword({
        currentPassword,
        newPassword,
        // パスワード漏えいを疑っての変更を想定し、他の端末のセッションは失効させる。
        // この端末には新しいセッション Cookie が発行されるためサインインは維持される。
        revokeOtherSessions: true,
      });
      if (res.error) {
        // INVALID_PASSWORD はこの画面固有。長さ規則は reset-password と共通のため共有ヘルパーに委ねる。
        setError(
          res.error.code === "INVALID_PASSWORD"
            ? "現在のパスワードが正しくありません"
            : (passwordRuleErrorMessage(res.error.code, "新しいパスワード") ??
                res.error.message ??
                "パスワードの変更に失敗しました"),
        );
        return;
      }
      setSuccess(true);
      setEditing(false);
    } catch {
      // ネットワーク断等で fetch 自体が reject するケース。HTTP エラーは res.error で返る。
      setError("パスワードの変更に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm">
          パスワード: <span className="font-mono text-xs">••••••••</span>
        </p>
        {!editing && (
          <button
            type="button"
            // メールアドレス行の「変更」ボタンと並ぶため、アクセシブルネームで区別できるようにする。
            aria-label="パスワードを変更"
            onClick={startEditing}
            className="btn btn-line btn-sm"
          >
            変更
          </button>
        )}
      </div>
      {success && <p className="note-ok">パスワードを変更しました</p>}
      {editing && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <input
            type="password"
            aria-label="現在のパスワード"
            placeholder="現在のパスワード"
            autoComplete="current-password"
            required
            // ボタン押下で開く編集フォームなので、開いた直後に入力へフォーカスを移す。
            autoFocus
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="field"
          />
          <input
            type="password"
            aria-label="新しいパスワード"
            placeholder="新しいパスワード（8文字以上）"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="field"
          />
          <p className="note-muted">変更すると他の端末ではサインアウトされます。</p>
          {error && <p className="note-danger">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              // 新パスワードはプレースホルダで案内している既定の最小長（8 文字）に達するまで
              // 無効化する。サーバー側の PASSWORD_TOO_SHORT 表示は設定変更時の防御として残す。
              disabled={submitting || currentPassword.length === 0 || newPassword.length < 8}
              className="btn btn-fill btn-sm"
            >
              保存
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setEditing(false)}
              className="btn btn-line btn-sm"
            >
              キャンセル
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
