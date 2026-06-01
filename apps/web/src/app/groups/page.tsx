"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { SessionPending, SignInPrompt } from "@/components/session-states";
import { apiClient } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";

export default function GroupsPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 所属グループ一覧。ログイン済みのときだけ取得する。
  // フックは early return より前で必ず呼ぶ（React のフック規則）。
  const {
    data: groupsData,
    isPending: groupsLoading,
    isError: groupsError,
  } = useQuery({
    queryKey: ["groups"],
    enabled: !!session,
    queryFn: async () => {
      const res = await apiClient.groups.$get();
      if (!res.ok) {
        throw new Error("グループ一覧の取得に失敗しました");
      }
      return res.json();
    },
  });

  if (isPending) {
    return <SessionPending />;
  }

  if (!session) {
    return <SignInPrompt message="グループを利用するにはサインインが必要です。" />;
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiClient.groups.$post({ json: { name } });
      if (!res.ok) {
        // requireAuth はミドルウェア適用のため RPC 型に 401 が現れない。
        // 実行時には返るので number に広げてセッション切れを区別する。
        const status: number = res.status;
        throw new Error(
          status === 401
            ? "セッションが切れました。再度サインインしてください。"
            : "グループの作成に失敗しました",
        );
      }
      const { id } = await res.json();
      // 一覧を最新化してから、作成したグループの画面へ遷移する。
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      router.push(`/groups/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "グループの作成に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  const groups = groupsData?.groups ?? [];

  return (
    <main className="flex flex-1 flex-col items-center gap-8 p-8">
      <h1 className="text-2xl font-semibold">グループ</h1>

      <section className="flex w-full max-w-xs flex-col gap-3">
        <h2 className="text-lg font-medium">所属グループ</h2>
        {groupsLoading && <p className="text-zinc-500">読み込み中…</p>}
        {groupsError && <p className="text-sm text-red-500">グループ一覧の取得に失敗しました。</p>}
        {!groupsLoading && !groupsError && groups.length === 0 && (
          <p className="text-sm text-zinc-500">
            まだグループがありません。下のフォームから作成しましょう。
          </p>
        )}
        {groups.length > 0 && (
          <ul className="flex flex-col gap-2">
            {groups.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/groups/${g.id}`}
                  className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <span>{g.name}</span>
                  <span className="text-xs text-zinc-500">
                    {g.role === "owner" ? "オーナー" : "メンバー"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form
        onSubmit={handleCreate}
        className="flex w-full max-w-xs flex-col gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800"
      >
        <h2 className="text-lg font-medium">グループを作成</h2>
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
