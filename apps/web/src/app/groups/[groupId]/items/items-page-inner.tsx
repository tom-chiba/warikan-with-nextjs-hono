"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { MainNav } from "@/components/main-nav";
import { SessionPending, SignInPrompt } from "@/components/session-states";
import { useSession } from "@/lib/auth-client";
import { useMarkGroupViewed } from "@/lib/current-group";
import { useGroups } from "@/lib/use-groups";
import { SettledView } from "./settled-view";
import { UnsettledView } from "./unsettled-view";

// アイテム一覧ページの本体。?status= で未精算 / 精算済ビューを切り替える（Epic #6）。
// ナビゲーション（入力 / 未精算 / 精算済タブ・グループ切替）は MainNav が担う（#51）。
// useSearchParams() を使うため、page.tsx 側の Suspense 境界配下でマウントされる。
export function ItemsPageInner() {
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;
  const searchParams = useSearchParams();
  // "settled" 以外の値（未指定・不正値）はすべて未精算ビューに倒す。
  const status = searchParams.get("status") === "settled" ? "settled" : "unsettled";
  const { data: session, isPending } = useSession();

  // MainNav のグループ切替セレクタ表示用。queryKey ["groups"] は / と共有されるため、
  // キャッシュが温まっていれば追加の往復は発生しない。
  const { data: groupsData } = useGroups(!!session);

  // このグループを「最後に開いた」として記録する（所属確認・カレント比較はフック側が行う）。
  useMarkGroupViewed(groupId, !!session);

  if (isPending) {
    return <SessionPending />;
  }

  if (!session) {
    return <SignInPrompt />;
  }

  const groups = groupsData?.groups ?? [];
  // 一覧取得が完了するまでは所属とみなして表示を維持する（取得失敗時もビュー自体は動く）。
  const isMember = !groupsData || groups.some((g) => g.id === groupId);

  // 脱退済み等、所属しないグループの URL を開いた場合はビューを出さず案内する。
  // ナビは残存グループへの脱出経路として、先頭グループを選択した状態で表示する。
  if (!isMember) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 py-6">
        <MainNav groups={groups} selectedGroupId={groups[0]?.id ?? null} activeTab={status} />
        <p className="note-muted">
          このグループのアイテムは表示できません（脱退済みか、リンクが古い可能性があります）。
        </p>
        <Link href="/" className="btn btn-line self-start">
          ホームへ
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 py-6">
      <MainNav groups={groups} selectedGroupId={groupId} activeTab={status} loading={!groupsData} />
      <div className="flex flex-col gap-1">
        <span className="kicker">{status === "settled" ? "Settled" : "Unsettled"}</span>
        <h1 className="headline">{status === "settled" ? "精算済アイテム" : "未精算アイテム"}</h1>
      </div>

      {status === "settled" ? (
        <SettledView groupId={groupId} />
      ) : (
        <UnsettledView groupId={groupId} />
      )}
    </main>
  );
}
