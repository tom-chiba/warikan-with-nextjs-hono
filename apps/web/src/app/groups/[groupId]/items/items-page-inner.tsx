"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { SessionPending, SignInPrompt } from "@/components/session-states";
import { useSession } from "@/lib/auth-client";
import { SettledView } from "./settled-view";
import { StatusTabs } from "./status-tabs";
import { UnsettledView } from "./unsettled-view";

// アイテム一覧ページの本体。?status= で未精算 / 精算済ビューを切り替える（Epic #6）。
// useSearchParams() を使うため、page.tsx 側の Suspense 境界配下でマウントされる。
export function ItemsPageInner() {
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;
  const searchParams = useSearchParams();
  // "settled" 以外の値（未指定・不正値）はすべて未精算ビューに倒す。
  const status = searchParams.get("status") === "settled" ? "settled" : "unsettled";
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <SessionPending />;
  }

  if (!session) {
    return <SignInPrompt />;
  }

  return (
    <main className="flex flex-1 flex-col items-center gap-8 p-8">
      <h1 className="text-2xl font-semibold">
        {status === "settled" ? "精算済アイテム" : "未精算アイテム"}
      </h1>

      <div className="flex gap-2">
        <Link
          href={`/groups/${groupId}/items/new`}
          className="rounded-md bg-black px-4 py-2 text-white dark:bg-white dark:text-black"
        >
          購入品を入力
        </Link>
        <Link href={`/groups/${groupId}`} className="rounded-md border px-4 py-2">
          グループへ戻る
        </Link>
      </div>

      <StatusTabs groupId={groupId} current={status} />

      {status === "settled" ? (
        <SettledView groupId={groupId} />
      ) : (
        <UnsettledView groupId={groupId} />
      )}
    </main>
  );
}
