"use client";

import Link from "next/link";
import { useState } from "react";
import { MainNav } from "@/components/main-nav";
import { SessionError, SessionPending } from "@/components/session-states";
import { APP_NAME } from "@/lib/app-meta";
import { resolveCurrentGroup } from "@/lib/current-group";
import { useGroups } from "@/lib/use-groups";
import { useResolvedSession } from "@/lib/use-resolved-session";
import { AuthPanel } from "./auth-panel";
import { QuickItemEntry } from "./quick-item-entry";
import { VerificationSentNotice } from "./verification-sent-notice";

export default function Home() {
  const { data: session, isPending, error, refetch } = useResolvedSession();
  // サインアップ成功（#69 の仮登録）で表示する確認メール案内。AuthPanel ではなくここで保持する理由は
  // VerificationSentNotice のコメント参照。サインアップ直後のセッション再取得（isPending）でも
  // 失われないよう、isPending 判定より前に評価する。
  const [signedUpEmail, setSignedUpEmail] = useState<string | null>(null);

  // 所属グループ一覧。セッション解決を待たずに並列で取得を開始する（直列 3 往復 → 2 往復）。
  // 未ログインなら 401 で失敗するが、その場合は下の !session 分岐で AuthPanel を出すため
  // エラーは画面に出ない（リトライもしない。サインイン後は SessionCacheBoundary が再取得させる）。
  // フックは early return より前で必ず呼ぶ（React のフック規則）。
  const { data: groupsData, isLoading: groupsLoading, isError: groupsError } = useGroups(true);

  // サインアップ直後はセッションが無いまま確認メール案内を出す。セッション再取得の isPending で
  // 画面が一瞬 SessionPending に切り替わって案内が消えないよう、isPending 判定より前に出す。
  if (signedUpEmail) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
        <div className="flex flex-col items-center gap-2">
          <h1 className="border-b-4 border-ink pb-1 text-4xl font-black uppercase tracking-[0.08em]">
            {APP_NAME}
          </h1>
          <p className="kicker">Split the bill, sharp.</p>
        </div>
        <VerificationSentNotice email={signedUpEmail} onBack={() => setSignedUpEmail(null)} />
      </main>
    );
  }

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
      <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
        <div className="flex flex-col items-center gap-2">
          {/* ワードマーク。太字大文字 + 太罫線でマストヘッドの基準線をつくる。 */}
          <h1 className="border-b-4 border-ink pb-1 text-4xl font-black uppercase tracking-[0.08em]">
            {APP_NAME}
          </h1>
          <p className="kicker">Split the bill, sharp.</p>
        </div>
        <AuthPanel onSignedUp={setSignedUpEmail} />
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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 py-6">
      <MainNav
        groups={groups}
        selectedGroupId={currentGroup?.id ?? null}
        activeTab="entry"
        loading={groupsLoading}
      />
      {groupsLoading && <p className="note-muted">グループを読み込み中…</p>}
      {groupsError && <p className="note-danger">グループ一覧の取得に失敗しました。</p>}
      {groupsReady && groups.length === 0 && (
        <div className="flex flex-col items-start gap-3">
          <p className="note-muted">
            まだグループがありません。グループを作成して購入品の入力を始めましょう。
          </p>
          <Link href="/groups" className="btn btn-fill">
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
