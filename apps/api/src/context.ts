import type { Session, User } from "better-auth";
import type { InferSelectModel } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type * as schema from "./db/schema";
import type { groupMember } from "./db/schema";

// 認可ミドルウェアが後続ハンドラへ渡すリクエストスコープ値の型。
// ここには Env / D1Database など Workers 固有のグローバル型を一切含めない。
// rpc.ts の AppType は最終的にこの型を経由するため、Workers 固有型が混入すると
// フロントエンド側で AppType の型解決が壊れる。型の単一ソースとして本ファイルに集約する。

export type AuthVariables = {
  session: Session;
  user: User;
};

// リクエストスコープの Drizzle インスタンス。drizzle のドライバ非依存な基底型
// BaseSQLiteDatabase を使うことで、Workers 固有型（D1Database）を AppType に混入させずに
// ルートハンドラから db.insert/select 等を型安全に呼べる（provide-db ミドルウェアが注入する）。
export type DbVariables = {
  db: BaseSQLiteDatabase<"async", unknown, typeof schema>;
};

export type GroupMemberVariables = AuthVariables & {
  groupMember: InferSelectModel<typeof groupMember>;
};
