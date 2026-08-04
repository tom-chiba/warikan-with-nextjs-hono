"use client";

import { useQueryClient } from "@tanstack/react-query";
import { NAME_MAX_LENGTH } from "@warikan/domain";
import { useState } from "react";
import { apiClient } from "@/lib/api-client";
import { memberKeys } from "@/lib/query-keys";
import { useAsyncAction } from "@/lib/use-async-action";

// メンバー一覧の 1 行。自分の行にだけグループ内表示名のインライン編集 UI を出す（#64）。
// 編集中フラグ・入力値・保存エラーは行内の関心事なのでここに閉じ込め、
// ページ側は招待リンクと退出・削除の管理に集中させる。

type Member = {
  userId: string;
  name: string; // 表示名解決済み（displayName ?? user.name）。API 側で解決される
  displayName: string | null; // 生値。編集フォームのプレフィルに使う（null = 未設定）
  email: string;
  role: "owner" | "member";
};

export function MemberRow({
  groupId,
  member,
  isSelf,
  canRemove,
  accountName,
  busy,
  onRemove,
}: {
  groupId: string;
  member: Member;
  isSelf: boolean;
  canRemove: boolean;
  // 未設定時のプレースホルダに使うアカウント名（session.user.name）。自分の行でのみ参照する。
  accountName: string;
  busy: boolean;
  onRemove: () => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const { busy: saving, error: editError, run, setError: setEditError } = useAsyncAction();

  function startEditing() {
    // 開くたびに現在の設定値から編集を始める（前回の編集途中の値やエラーを持ち越さない）。
    setInput(member.displayName ?? "");
    setEditError(null);
    setEditing(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      const res = await apiClient.groups[":groupId"].members.me["display-name"].$put({
        param: { groupId },
        json: { displayName: input.trim() },
      });
      if (!res.ok) {
        throw new Error("表示名の保存に失敗しました");
      }
      // 表示名はメンバー一覧・支払/負担ラベル・送金リストの全画面が
      // ["members", groupId] キャッシュ経由で参照するため、無効化だけで全箇所に反映される。
      await queryClient.invalidateQueries({ queryKey: memberKeys.byGroup(groupId) });
      setEditing(false);
    }, "表示名の保存に失敗しました");
  }

  return (
    <li className="flex flex-col gap-2 border-b border-rule px-1 py-3">
      <div className="flex items-center justify-between">
        <span className="flex flex-col">
          <span className="font-bold">
            {member.name}
            {isSelf && <span className="ml-1 text-xs font-medium text-muted">（あなた）</span>}
          </span>
          <span className="text-xs text-muted">{member.email}</span>
        </span>
        <span className="flex items-center gap-3">
          <span className="text-xs font-bold tracking-widest text-muted">
            {member.role === "owner" ? "オーナー" : "メンバー"}
          </span>
          {isSelf && !editing && (
            <button
              type="button"
              disabled={busy}
              onClick={startEditing}
              className="btn btn-line btn-sm"
            >
              表示名を変更
            </button>
          )}
          {canRemove && (
            <button
              type="button"
              disabled={busy}
              onClick={onRemove}
              className="btn btn-line-danger btn-sm"
            >
              {isSelf ? "退出" : "削除"}
            </button>
          )}
        </span>
      </div>
      {isSelf && editing && (
        <form onSubmit={handleSave} className="flex flex-col gap-2">
          <input
            type="text"
            aria-label="表示名"
            placeholder={accountName}
            maxLength={NAME_MAX_LENGTH}
            // ボタン押下で開く編集フォームなので、開いた直後に入力へフォーカスを移す。
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="field"
          />
          <p className="note-muted">
            このグループでの表示名を設定できます（未設定の場合はアカウント名が表示されます）。
          </p>
          {editError && <p className="note-danger">{editError}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || input.trim().length === 0}
              className="btn btn-fill btn-sm"
            >
              保存
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setEditing(false)}
              className="btn btn-line btn-sm"
            >
              キャンセル
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
