// TanStack Query の queryKey を集約するファクトリ。
// 前方一致無効化用（byGroup 等）と完全一致用（list/detail 等）を関数名で区別し、
// 無効化スコープの意図（同一リスト内で完結させたいか、関連リストをまたいで無効化したいか）を
// 呼び出し側で読み取れるようにする。

export const groupKeys = {
  all: () => ["groups"] as const,
};

export const memberKeys = {
  byGroup: (groupId: string) => ["members", groupId] as const,
};

export const itemKeys = {
  // 前方一致無効化用。未精算/精算済をまたいでアイテムが移動するケース（編集・精算・戻す）で使う。
  byGroup: (groupId: string) => ["items", groupId] as const,
  // 完全一致。単一ステータスの一覧（削除は同一リスト内で完結する）。
  list: (groupId: string, status: "unsettled" | "settled") => ["items", groupId, status] as const,
  detail: (groupId: string, itemId: string) => ["item", groupId, itemId] as const,
};

export const itemsOnDateKeys = {
  // 前方一致無効化用。日付別に複数キーがありうるので groupId 単位でまとめて無効化する。
  byGroup: (groupId: string) => ["items-on-date", groupId] as const,
  detail: (groupId: string, purchasedOn: string) =>
    ["items-on-date", groupId, purchasedOn] as const,
};

export const invitationKeys = {
  active: (groupId: string) => ["invitation", groupId] as const,
};

export const invitationPreviewKeys = {
  detail: (token: string) => ["invitation-preview", token] as const,
};
