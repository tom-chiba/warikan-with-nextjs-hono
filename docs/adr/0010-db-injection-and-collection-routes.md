---
status: accepted
date: 2026-05-31
deciders: tom-chiba
---

# ハンドラへの DB 注入とコレクションルートの認可

## Context and Problem Statement

[ADR-0009](./0009-group-authorization-layer.md) は「認可ミドルウェアは `index.ts` 側で適用し、ルート定義は Variables だけで型付けする」ことで、`rpc.ts`／ルートを Workers 固有型（`Env` / `D1Database`）に非依存に保ち、フロントエンドが `AppType` を型解決できる状態を維持した（[ADR-0005](./0005-api-integration-hono-rpc.md)）。

ここで 2 つの未解決事項が生じた。グループ機能（[#3](https://github.com/tom-chiba/warikan-with-nextjs-hono/issues/3)）の実装で確定させる。

1. **ハンドラから DB を使う手段**: グループ作成のような書き込みは「リクエストボディ + ログインユーザー」を必要とし、ミドルウェアではなくハンドラ本体で行うのが自然。しかし `apps/web` の `tsc` は `@warikan/api` の `exports.types`（= `rpc.ts`）から到達可能な実装ファイルまで型検査するため、ハンドラが `createDb(c.env.DB)`（`Env` / `D1Database` を参照）を直接呼ぶと web 側のビルドが壊れる。`Db`（= `DrizzleD1Database`）型を Variables に載せても、その型が `D1Result` 等の Workers グローバルを参照するため同様に壊れる。
2. **メンバーシップを要さない保護ルート**: グループ作成・一覧・招待からの参加は「ログインは必須だが、まだ当該グループのメンバーではない」。[ADR-0009](./0009-group-authorization-layer.md) の `/groups/:groupId/*`（`requireAuth` + `requireGroupMember`）には載せられない。

## Decision Drivers

- ハンドラ（`rpc.ts` グラフ）を Workers 固有型に非依存に保つ（[ADR-0005](./0005-api-integration-hono-rpc.md) / [ADR-0009](./0009-group-authorization-layer.md)）
- ハンドラから型安全に DB 操作（`insert`/`select` 等）ができる
- ログインのみ要求するルートと、メンバーシップまで要求するルートを取り違えない

## Considered Options

- **DB の渡し方**: ①ハンドラで `c.env.DB` を直接参照（`Bindings: Env` が必要）/ ②ミドルウェアで生成し Variables に注入 / ③リポジトリ層を Variables に注入
- **Variables に載せる db の型**: ①`DrizzleD1Database`（Workers グローバル参照）/ ②ドライバ非依存の基底型 `BaseSQLiteDatabase`
- **コレクションルートの置き場**: ①`/groups/:groupId/*` に同居 / ②`:groupId` を伴わない `/groups` を別ミドルウェアで保護

## Decision Outcome

**DB はミドルウェアで生成して Variables に注入し、その型はドライバ非依存の `BaseSQLiteDatabase` とする。コレクションルートは `requireAuth` のみ（+ `provideDb`）で保護する。**

- **`provideDb` ミドルウェア**: `src/middleware/provide-db.ts` に置き、`c.set("db", createDb(c.env.DB))` でリクエストスコープの Drizzle を Variables に載せる。`Env`/`D1Database` 依存はこのミドルウェア（`index.ts` グラフ）に閉じる。
- **`DbVariables` 型**: `src/context.ts` に `db: BaseSQLiteDatabase<"async", unknown, typeof schema>` として一元定義する。`BaseSQLiteDatabase`（`drizzle-orm/sqlite-core`）は Workers 固有型を参照しないため `AppType` に混入しない。`DrizzleD1Database` は `BaseSQLiteDatabase` に代入可能なので、注入時にキャストは不要。複数テーブルへの原子的な書き込みのため、`DrizzleD1Database.batch` と同一シグネチャの `batch`（`BatchItem`/`BatchResponse` は `D1Result` 等の Workers 固有型を参照しない）を交差型として `DbVariables` に付与する。これで `AppType` を web-safe に保ったまま `db.batch([...])` を型安全に呼べる。D1 は対話的トランザクション非対応で `db.transaction()`（生 `BEGIN`/`COMMIT` を発行）が実行時に失敗するため、`transaction()` は使わず `batch`（暗黙の SQL トランザクション = all-or-nothing）を用いる。
- **コレクションルート**: `:groupId` を伴わない `/groups`（作成・一覧）は `new Hono<{ Variables: AuthVariables & DbVariables }>()` で宣言し、`index.ts` で `app.use("/groups", requireAuth(), provideDb())` を `app.route("/", routes)` より前に適用する。`app.use` の静的パスは完全一致なので、メンバー限定の `/groups/:groupId/*` とは独立に効く。

### Consequences

- 良い点: ハンドラは `c.get("db")` で型安全に DB を操作でき、`rpc.ts` グラフは Workers 固有型に非依存のまま（web の `AppType` 解決が壊れない）。DB 注入パターンは後続のドメイン RPC（item CRUD・精算など）でも再利用できる。ログイン要否とメンバーシップ要否がミドルウェアの適用パスで明確に分離される。
- 良い点（追補）: `DbVariables` に web-safe な `batch` を付与したことで、グループ作成（`group` + `group_member`）のような複数テーブル書き込みを `db.batch([...])` で原子的に行える。片方だけ成功してオーナー不在グループが残ることはない（`group_member` 挿入が失敗すれば `group` 挿入もロールバックされる）。
- 悪い点 / トレードオフ: D1 は対話的トランザクション非対応のため、読み取り結果に応じて分岐しながら複数文を 1 トランザクションに収める用途（read-modify-write）は `batch` では表現できない。現状の書き込みはいずれも事前に値が確定する独立 `insert` のため `batch` で足りるが、対話的な整合性が必要な操作が出たら別途設計が要る。
- 注意: 一覧系はゴミデータを拾わないよう、必ず `group_member` を起点に取得する（`group` テーブルの直読みをしない）。

## More Information

- 実装は `apps/api/src/middleware/provide-db.ts`、`apps/api/src/context.ts`（`DbVariables`）、`apps/api/src/routes/groups-collection.ts`、`apps/api/src/index.ts` を参照。
- 関連: [ADR-0005](./0005-api-integration-hono-rpc.md)（Hono RPC）, [ADR-0006](./0006-orm-drizzle-d1.md)（Drizzle/D1）, [ADR-0009](./0009-group-authorization-layer.md)（グループ認可レイヤ）。
