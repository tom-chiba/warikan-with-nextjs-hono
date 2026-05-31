import type { Session, User } from "better-auth";
import type { InferSelectModel } from "drizzle-orm";
import type { groupMember } from "./db/schema";

// 認可ミドルウェアが後続ハンドラへ渡すリクエストスコープ値の型。
// ここには Env / D1Database など Workers 固有のグローバル型を一切含めない。
// rpc.ts の AppType は最終的にこの型を経由するため、Workers 固有型が混入すると
// フロントエンド側で AppType の型解決が壊れる。型の単一ソースとして本ファイルに集約する。

export type AuthVariables = {
  session: Session;
  user: User;
};

export type GroupMemberVariables = AuthVariables & {
  groupMember: InferSelectModel<typeof groupMember>;
};
