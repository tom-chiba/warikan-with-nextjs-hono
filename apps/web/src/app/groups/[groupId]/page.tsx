"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

// グループページのプレースホルダ。メンバー管理・招待リンク発行は後続 Issue（#11, #13）で実装する。
export default function GroupPage() {
  const params = useParams<{ groupId: string }>();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">グループ</h1>
      <p>
        グループ ID: <span className="font-mono">{params.groupId}</span>
      </p>
      <p className="text-sm text-zinc-500">メンバー管理・招待リンクは今後の Issue で実装します。</p>
      <Link href="/groups" className="rounded-md border px-4 py-2">
        グループを作成
      </Link>
    </main>
  );
}
