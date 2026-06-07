// グループ一覧ルート（routes/groups-collection.ts）から切り出した純粋関数。
// DB・Hono コンテキストに依存しないカレントグループ判定を単体テスト可能にする。

export type GroupListRow = {
  id: string;
  name: string;
  role: "owner" | "member";
  lastViewedAt: Date | null;
};

// 一覧の整形（lastViewedAt を外す）とカレント判定を 1 回の走査でまとめて行う。
// カレントグループ = 最後に開いたグループ（last_viewed_at が最大の行）。一度も記録がなければ null。
// 同値タイはミリ秒精度の last_viewed_at で実質発生しない想定（db/schema.ts 参照）だが、
// 発生した場合は走査順（joinedAt, group.id 順）で先の行が勝つ。
export function buildGroupList(rows: GroupListRow[]) {
  const groups: { id: string; name: string; role: GroupListRow["role"] }[] = [];
  let currentGroupId: string | null = null;
  let latest = 0;
  for (const { id, name, role, lastViewedAt } of rows) {
    groups.push({ id, name, role });
    const viewedAt = lastViewedAt?.getTime() ?? 0;
    if (viewedAt > latest) {
      latest = viewedAt;
      currentGroupId = id;
    }
  }
  return { groups, currentGroupId };
}
