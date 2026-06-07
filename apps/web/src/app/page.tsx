"use client";

import Link from "next/link";
import { MainNav } from "@/components/main-nav";
import { SessionError, SessionPending } from "@/components/session-states";
import { APP_NAME } from "@/lib/app-meta";
import { useSession } from "@/lib/auth-client";
import { resolveCurrentGroup } from "@/lib/current-group";
import { useGroups } from "@/lib/use-groups";
import { AuthPanel } from "./auth-panel";
import { QuickItemEntry } from "./quick-item-entry";

export default function Home() {
  const { data: session, isPending, error, refetch } = useSession();

  // 所属グループ一覧。セッション解決を待たずに並列で取得を開始する（直列 3 往復 → 2 往復）。
  // 未ログインなら 401 で失敗するが、その場合は下の !session 分岐で AuthPanel を出すため
  // エラーは画面に出ない（リトライもしない。サインイン後は SessionCacheBoundary が再取得させる）。
  // フックは early return より前で必ず呼ぶ（React のフック規則）。
  const { data: groupsData, isLoading: groupsLoading, isError: groupsError } = useGroups(true);

  if (isPending) {
    return <SessionPending />;
  }

  // セッション取得自体の失敗（API 不達・5xx）は未ログインと区別して再試行を促す。
  if (error) {
    return <SessionError onRetry={() => refetch()} />;
  }

  // 未ログインならサインアップ/サインインフォームを中心に表示する。他ページの
  // SignInPrompt（@/components/session-states）が href="/" でここへ誘導するため、この導線は維持する。
  if (!session) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <h1 className="text-2xl font-semibold">{APP_NAME}</h1>
        <AuthPanel />
      </main>
    );
  }

  const groups = groupsData?.groups ?? [];
  const groupsReady = !groupsLoading && !groupsError;
  // 最頻の操作である購入品入力を最短で出す（#45）。複数グループ所属時もカレントグループ
  //（最後に開いたグループ。無効なら先頭へフォールバック）のクイック入力を直接表示し、
  // グループの切替・管理は MainNav に集約する（#51）。
  const currentGroup = resolveCurrentGroup(groups, groupsData?.currentGroupId);

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-8">
      <MainNav
        groups={groups}
        selectedGroupId={currentGroup?.id ?? null}
        activeTab="entry"
        loading={groupsLoading}
      />
      {groupsLoading && <p className="text-zinc-500">グループを読み込み中…</p>}
      {groupsError && <p className="text-sm text-red-500">グループ一覧の取得に失敗しました。</p>}
      {groupsReady && groups.length === 0 && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-zinc-500">
            まだグループがありません。グループを作成して購入品の入力を始めましょう。
          </p>
          <Link
            href="/groups"
            className="rounded-md bg-black px-4 py-2 text-white dark:bg-white dark:text-black"
          >
            グループを作成
          </Link>
        </div>
      )}
      {groupsReady &&
        currentGroup && (
          // key でグループ切替時にフォームを確実に作り直す（入力途中の割勘状態を持ち越さない）。
          <QuickItemEntry
            key={currentGroup.id}
            groupId={currentGroup.id}
            groupName={currentGroup.name}
          />
        )}
    </main>
  );
}
