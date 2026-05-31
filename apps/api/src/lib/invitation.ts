// 招待が有効（未失効かつ期限内）かを判定する。プレビューと参加で同じ判定を使うため一元化する。
// Date のみに依存し Workers 固有型を持たないため rpc.ts グラフ（ルートハンドラ）から安全に import できる。
export function isActiveInvitation(invitation: {
  expiresAt: Date;
  revokedAt: Date | null;
}): boolean {
  return invitation.revokedAt === null && invitation.expiresAt > new Date();
}
