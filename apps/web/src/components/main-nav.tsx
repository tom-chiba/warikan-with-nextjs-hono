"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type GroupSummary, setCurrentGroup } from "@/lib/current-group";

export type MainNavTab = "entry" | "unsettled" | "settled";

type Props = {
  groups: GroupSummary[];
  // 表示中のグループ。/ ではカレントグループ、items ページでは URL のグループを渡す。
  selectedGroupId: string | null;
  activeTab: MainNavTab;
};

// メイン 3 ページ（入力 / 未精算 / 精算済）の常設ナビゲーション（#51）。
// ヘッダー行にグループ切替セレクタと設定（歯車）リンク、その下に 3 タブを置く。
// グループ管理・アカウント設定は日常動線から外し、歯車 → /settings に集約する。
export function MainNav({ groups, selectedGroupId, activeTab }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();

  function handleGroupChange(nextId: string) {
    setCurrentGroup(queryClient, nextId);
    // 一覧系タブを開いているときは、切替先グループの同じタブへ移動する。
    // 入力タブ（/）はキャッシュ上のカレント更新に画面が追従するため遷移不要。
    if (activeTab === "unsettled") {
      router.push(`/groups/${nextId}/items`);
    } else if (activeTab === "settled") {
      router.push(`/groups/${nextId}/items?status=settled`);
    }
  }

  const tabClass = (active: boolean) =>
    `rounded-md border px-4 py-2 ${active ? "bg-black text-white dark:bg-white dark:text-black" : ""}`;

  return (
    <header className="flex w-full max-w-md flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        {groups.length >= 2 ? (
          <select
            aria-label="グループを切替"
            value={selectedGroupId ?? ""}
            onChange={(e) => handleGroupChange(e.target.value)}
            className="min-w-0 flex-1 rounded-md border px-3 py-2"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="truncate text-lg font-medium">
            {groups.find((g) => g.id === selectedGroupId)?.name ?? "グループなし"}
          </span>
        )}
        <Link href="/settings" aria-label="設定" className="shrink-0 rounded-md border p-2">
          {/* 歯車アイコン（Feather: settings）。アイコンライブラリは追加せずインラインで持つ。 */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
      </div>
      <nav aria-label="メインナビゲーション" className="flex gap-2">
        <Link href="/" className={tabClass(activeTab === "entry")}>
          入力
        </Link>
        {selectedGroupId ? (
          <>
            <Link
              href={`/groups/${selectedGroupId}/items`}
              className={tabClass(activeTab === "unsettled")}
            >
              未精算
            </Link>
            <Link
              href={`/groups/${selectedGroupId}/items?status=settled`}
              className={tabClass(activeTab === "settled")}
            >
              精算済
            </Link>
          </>
        ) : (
          // グループ未所属のときは一覧を開けないため、タブを不活性表示にする。
          <>
            <span aria-disabled="true" className="rounded-md border px-4 py-2 text-zinc-400">
              未精算
            </span>
            <span aria-disabled="true" className="rounded-md border px-4 py-2 text-zinc-400">
              精算済
            </span>
          </>
        )}
      </nav>
    </header>
  );
}
