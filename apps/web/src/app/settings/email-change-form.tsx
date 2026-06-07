"use client";

import { type FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

// 設定ページのメールアドレス行 + インライン変更フォーム（#61）。
// 編集中フラグ・入力値・エラー/成功は行内の関心事なのでここに閉じ込め、
// ページ側は設定ハブの構成に集中させる（#64 の MemberRow と同じ方針）。
export function EmailChangeForm({ currentEmail }: { currentEmail: string }) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function startEditing() {
    // 開くたびに現在のメールアドレスから編集を始める（前回のエラーや成功表示を持ち越さない）。
    setInput(currentEmail);
    setError(null);
    setSuccess(false);
    setEditing(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await authClient.changeEmail({ newEmail: input.trim() });
      if (res.error) {
        // 既存メールとの重複は自前の hooks.before が日本語 message で返すため、そのまま表示する。
        setError(res.error.message ?? "メールアドレスの変更に失敗しました");
        return;
      }
      // 成功時はセッション Cookie が新メールで更新され、useSession の自動再取得で
      // 表示中のメールアドレスも更新される。フォームを閉じて成功メッセージを示す。
      setSuccess(true);
      setEditing(false);
    } catch {
      // ネットワーク断等で fetch 自体が reject するケース。HTTP エラーは res.error で返る。
      setError("メールアドレスの変更に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  // 現在と同じメールアドレスは送っても変更にならない（サーバーで 400 になる）ため、
  // 保存ボタン側で無効化して no-op の送信を防ぐ。currentEmail は Better Auth が
  // 小文字に正規化済みだが、比較は防御的に両辺とも小文字で揃える。
  const unchanged = input.trim().toLowerCase() === currentEmail.toLowerCase();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm">
          メール: <span className="font-mono text-xs">{currentEmail}</span>
        </p>
        {!editing && (
          <button
            type="button"
            // パスワード行の「変更」ボタンと並ぶため、アクセシブルネームで区別できるようにする。
            aria-label="メールアドレスを変更"
            onClick={startEditing}
            className="btn btn-line btn-sm"
          >
            変更
          </button>
        )}
      </div>
      {success && <p className="note-ok">メールアドレスを変更しました</p>}
      {editing && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <input
            type="email"
            aria-label="新しいメールアドレス"
            placeholder="新しいメールアドレス"
            autoComplete="email"
            required
            // ボタン押下で開く編集フォームなので、開いた直後に入力へフォーカスを移す。
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="field"
          />
          <p className="note-muted">変更後は新しいメールアドレスでサインインします。</p>
          {error && <p className="note-danger">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting || input.trim().length === 0 || unchanged}
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
