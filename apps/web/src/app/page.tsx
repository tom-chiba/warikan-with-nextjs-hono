"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { AuthPanel } from "./auth-panel";

export default function Home() {
  const { data, isPending, error } = useQuery({
    queryKey: ["hello", { name: "chiba" }],
    queryFn: async () => {
      // apiClient.hello.$get の query は AppType から型付けされる。
      const res = await apiClient.hello.$get({ query: { name: "chiba" } });
      if (!res.ok) throw new Error("API request failed");
      // res.json() の戻り値も { message: string } として推論される。
      return res.json();
    },
  });

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">warikan</h1>
      <div className="rounded-lg border border-zinc-200 px-6 py-4 dark:border-zinc-800">
        {isPending && <p className="text-zinc-500">Loading…</p>}
        {error && <p className="text-red-500">Error: {error.message}</p>}
        {data && <p className="font-mono">API: {data.message}</p>}
      </div>
      <p className="text-sm text-zinc-500">
        apps/api の <code>/hello</code> を Hono RPC + TanStack Query で型安全に取得
      </p>

      <section className="mt-4 flex flex-col items-center gap-3 border-t border-zinc-200 pt-8 dark:border-zinc-800">
        <h2 className="text-lg font-medium">アカウント</h2>
        <AuthPanel />
        <Link href="/settings" className="text-sm text-zinc-500 underline">
          アカウント設定
        </Link>
      </section>

      <Link href="/groups" className="rounded-md border px-4 py-2">
        グループ
      </Link>
    </main>
  );
}
