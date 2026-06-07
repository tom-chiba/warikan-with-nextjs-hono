"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiClient } from "@/lib/api-client";

// グループ詳細ページの見出し。owner にだけグループ名のインライン編集 UI を出す（#65）。
// member-row.tsx の表示名変更と同じく、編集中フラグ・入力値・保存エラーは
// 見出しの関心事としてここに閉じ込め、ページ側は招待・メンバー管理に集中させる。

export function GroupNameEditor({
  groupId,
  groupName,
  isOwner,
}: {
  groupId: string;
  // ["groups"] キャッシュ未着の間は null（見出しは固定テキストにフォールバックし、
  // 変更ボタンは現在名をプレフィルできないため無効化して出しておく）。
  groupName: string | null;
  isOwner: boolean;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function startEditing() {
    // 開くたびに現在のグループ名から編集を始める（前回の編集途中の値やエラーを持ち越さない）。
    // groupName が null の間はボタンを無効化しているため、ここでは必ず取得済み。
    setInput(groupName ?? "");
    setEditError(null);
    setEditing(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setEditError(null);
    setSaving(true);
    try {
      const res = await apiClient.groups[":groupId"].$patch({
        param: { groupId },
        json: { name: input.trim() },
      });
      if (!res.ok) {
        throw new Error("グループ名の保存に失敗しました");
      }
      // グループ名はこの見出し・グループ一覧・ルートのクイック入力が
      // ["groups"] キャッシュ経由で参照するため、無効化だけで全箇所に反映される。
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "グループ名の保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  // 見出し（h1）は編集中もページから消さない（スクリーンリーダーの見出しナビゲーションと
  // 文書構造を保つ）。member-row と同様、編集フォームは見出しの下に展開する。
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h1 className="headline">{groupName ?? "グループ"}</h1>
        {isOwner && !editing && (
          <button
            type="button"
            disabled={groupName === null}
            onClick={startEditing}
            className="btn btn-line btn-sm"
          >
            変更
          </button>
        )}
      </div>
      {editing && (
        <form onSubmit={handleSave} className="flex flex-col gap-2">
          <input
            type="text"
            aria-label="グループ名"
            maxLength={100}
            // ボタン押下で開く編集フォームなので、開いた直後に入力へフォーカスを移す。
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="field"
          />
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
    </div>
  );
}
