"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";

export default function GroupsPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isPending) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <p className="text-zinc-500">セッション確認中…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <p>グループを作成するにはサインインが必要です。</p>
        <Link href="/" className="rounded-md border px-4 py-2">
          サインインへ
        </Link>
      </main>
    );
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiClient.groups.$post({ json: { name } });
      if (!res.ok) {
        throw new Error("グループの作成に失敗しました");
      }
      const { id } = await res.json();
      // 作成後はそのグループの画面へ遷移する。
      router.push(`/groups/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "グループの作成に失敗しました");
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">グループを作成</h1>
      <form onSubmit={handleCreate} className="flex w-full max-w-xs flex-col gap-3">
        <input
          type="text"
          aria-label="グループ名"
          placeholder="グループ名（例: 京都旅行）"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border px-3 py-2"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={submitting || name.trim().length === 0}
          className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          作成
        </button>
      </form>
    </main>
  );
}
