import type { Session, User } from "better-auth";
import type { InferSelectModel } from "drizzle-orm";
import type { BatchItem, BatchResponse } from "drizzle-orm/batch";
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
//
// batch() は基底型 BaseSQLiteDatabase には無いが、D1 は対話的トランザクション（BEGIN/COMMIT）
// 非対応で db.transaction() が実行時に失敗するため、原子的な複数書き込みは D1 の batch
// （= 暗黙の SQL トランザクションで all-or-nothing）で行う。batch のシグネチャは
// DrizzleD1Database のものと一致し、かつ BatchItem/BatchResponse は D1 固有型（D1Result）を
// 含まないため、AppType を web-safe に保ったまま batch 能力だけを付与できる。
export type DbVariables = {
  db: BaseSQLiteDatabase<"async", unknown, typeof schema> & {
    batch<U extends BatchItem<"sqlite">, T extends Readonly<[U, ...U[]]>>(
      batch: T,
    ): Promise<BatchResponse<T>>;
  };
};

export type GroupMemberVariables = AuthVariables & {
  groupMember: InferSelectModel<typeof groupMember>;
};
