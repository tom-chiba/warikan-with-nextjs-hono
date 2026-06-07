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
  // グループ一覧の取得中フラグ。取得完了まで「グループなし」と断定しないために使う。
  loading?: boolean;
};

// 歯車アイコン（Feather: settings）。アイコンライブラリは追加せずインラインで持ち、
// 静的な SVG ノードなのでモジュールレベルに巻き上げて再レンダー時の再生成を避ける。
const gearIcon = (
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
);

// メイン 3 ページ（入力 / 未精算 / 精算済）の常設ナビゲーション（#51）。
// ヘッダー行にグループ切替セレクタと設定（歯車）リンク、その下に 3 タブを置く。
// グループ管理・アカウント設定は日常動線から外し、歯車 → /settings に集約する。
export function MainNav({ groups, selectedGroupId, activeTab, loading = false }: Props) {
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

  // 下線タブ（エディトリアル・シャープ, Issue #38）。アクティブは太い墨色の下線 + 強い字、
  // 非アクティブは透明下線で高さを揃え、ホバーで文字色だけ立てる。
  const tabClass = (active: boolean) =>
    `-mb-px border-b-3 px-1 pb-2 text-sm tracking-wide transition-colors ${
      active
        ? "border-ink font-extrabold text-ink"
        : "border-transparent font-bold text-muted hover:text-ink"
    }`;

  // 表示名: 取得中や名前が引けない間（取得失敗時の items ページ等）は控えめなプレースホルダにし、
  // 「グループなし」は取得が完了して本当に所属 0 件のときだけ出す。
  const selectedName = groups.find((g) => g.id === selectedGroupId)?.name;

  return (
    <header className="flex w-full flex-col gap-3">
      {/* マストヘッド: ワードマークと設定（歯車）。太罫線でページ全体の基準線を引く。 */}
      <div className="flex items-center justify-between border-b-2 border-ink pb-2">
        <Link href="/" className="text-lg font-black uppercase tracking-[0.08em]">
          Warikan
        </Link>
        <Link
          href="/settings"
          aria-label="設定"
          className="shrink-0 p-1 text-muted transition-colors hover:text-ink"
        >
          {gearIcon}
        </Link>
      </div>
      <div className="flex items-center justify-between gap-3">
        {groups.length >= 2 ? (
          <select
            aria-label="グループを切替"
            value={selectedGroupId ?? ""}
            onChange={(e) => handleGroupChange(e.target.value)}
            className="field min-w-0 flex-1 py-1.5 text-sm font-bold"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="truncate text-base font-extrabold">
            {selectedName ?? (loading || selectedGroupId ? "…" : "グループなし")}
          </span>
        )}
      </div>
      <nav aria-label="メインナビゲーション" className="flex gap-5 border-b border-rule">
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
            <span
              aria-disabled="true"
              className="-mb-px border-b-3 border-transparent px-1 pb-2 text-sm font-bold tracking-wide text-muted/50"
            >
              未精算
            </span>
            <span
              aria-disabled="true"
              className="-mb-px border-b-3 border-transparent px-1 pb-2 text-sm font-bold tracking-wide text-muted/50"
            >
              精算済
            </span>
          </>
        )}
      </nav>
    </header>
  );
}
