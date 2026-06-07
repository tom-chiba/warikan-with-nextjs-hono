"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { SessionPending, SignInPrompt } from "@/components/session-states";
import { apiClient } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";
import { useGroups } from "@/lib/use-groups";

export default function GroupsPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 所属グループ一覧。ログイン済みのときだけ取得する。
  // フックは early return より前で必ず呼ぶ（React のフック規則）。
  // isPending は enabled: false（未ログイン）でも true になるため、実際に取得中かは isLoading で見る。
  const { data: groupsData, isLoading: groupsLoading, isError: groupsError } = useGroups(!!session);

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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-5 py-6">
      <div className="flex flex-col gap-1">
        <span className="kicker">Groups</span>
        <h1 className="headline">グループ</h1>
      </div>

      <section className="flex w-full flex-col gap-3">
        <h2 className="section-title section-rule">所属グループ</h2>
        {groupsLoading && <p className="note-muted">読み込み中…</p>}
        {groupsError && <p className="note-danger">グループ一覧の取得に失敗しました。</p>}
        {!groupsLoading && !groupsError && groups.length === 0 && (
          <p className="note-muted">まだグループがありません。下のフォームから作成しましょう。</p>
        )}
        {groups.length > 0 && (
          <ul className="flex flex-col">
            {groups.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/groups/${g.id}`}
                  className="flex items-center justify-between border-b border-rule px-1 py-3 transition-colors hover:bg-ink/5"
                >
                  <span className="font-bold">{g.name}</span>
                  <span className="text-xs font-bold tracking-widest text-muted">
                    {g.role === "owner" ? "オーナー" : "メンバー"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form onSubmit={handleCreate} className="flex w-full flex-col gap-3">
        <h2 className="section-title section-rule">グループを作成</h2>
        <input
          type="text"
          aria-label="グループ名"
          placeholder="グループ名（例: 京都旅行）"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="field"
        />
        {error && <p className="note-danger">{error}</p>}
        <button
          type="submit"
          disabled={submitting || name.trim().length === 0}
          className="btn btn-fill"
        >
          作成
        </button>
      </form>

      {/* グループ管理は設定ハブ（/settings）配下の動線（#51）。 */}
      <div className="flex gap-5">
        <Link href="/settings" className="link-quiet">
          設定へ戻る
        </Link>
        <Link href="/" className="link-quiet">
          ホームへ
        </Link>
      </div>
    </main>
  );
}
