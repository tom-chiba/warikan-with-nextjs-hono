"use client";

import { type FormEvent, useState } from "react";
import { authClient, verifyEmailCallbackURL } from "@/lib/auth-client";

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
      const res = await authClient.changeEmail({
        newEmail: input.trim(),
        // 確認リンク踏破後の着地先（#69）。検証済みユーザーの変更は新アドレス宛に
        // 確認リンクを送り、踏破時にこの /verify-email へ戻って変更が確定する。
        callbackURL: verifyEmailCallbackURL(),
      });
      if (res.error) {
        // 既存メールとの重複は自前の hooks.before が日本語 message で返すため、そのまま表示する。
        setError(res.error.message ?? "メールアドレスの変更に失敗しました");
        return;
      }
      // #69 でメール検証を導入したため、検証済みユーザーの変更は即時反映されず、
      // 新しいアドレス宛に確認リンクが送られる。リンクを踏むまでメールは変わらないので、
      // ここでは「確認メールを送った」ことだけを示す。実際の変更確定とメンバー一覧
      //（["members"] キャッシュ）の更新は /verify-email 着地後のセッション更新で反映される。
      // changeEmail の確認メール方式への正式対応（現メール承認・専用 UI）は後続 Issue。
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
      {success && (
        <p className="note-ok">
          確認メールを送信しました。新しいメールアドレス宛のリンクを開くと変更が完了します。
        </p>
      )}
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
          <p className="note-muted">
            新しいメールアドレスに確認メールを送ります。リンクを開くと変更が完了し、以後は新しい
            メールアドレスでサインインします。
          </p>
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
