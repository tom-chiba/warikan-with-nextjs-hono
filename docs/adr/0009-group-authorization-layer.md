---
status: accepted
date: 2026-05-31
deciders: tom-chiba
---

# グループ単位の認可レイヤの構成

## Context and Problem Statement

グループ内の割勘は「そのグループのメンバーだけ」が閲覧・操作できる必要がある。各 RPC で個別に認可を書くと漏れるため共通の認可レイヤを用意する。一方で、認可は Better Auth セッション検証と D1（[ADR-0006](./0006-orm-drizzle-d1.md)）への `group_member` 照会を必要とし、いずれも実行時 `env`（`Env` / `D1Database`）に依存する。これは「RPC ルート定義（`rpc.ts`）を Workers 固有型に非依存に保ち、フロントエンドが `AppType` を型解決できるようにする」という [ADR-0005](./0005-api-integration-hono-rpc.md) の前提と衝突しうる。両立する構成を決める。

## Decision Drivers

- 認可漏れを防ぐ（保護対象を 1 箇所で宣言的に適用できる）
- `rpc.ts` / ルート定義を `Env` / `D1Database` に依存させず、`AppType` をフロントエンドが解決できる状態を維持する（[ADR-0005](./0005-api-integration-hono-rpc.md)）
- 後続ハンドラが user / group メンバー情報を型安全に参照できる
- 後続のドメイン RPC（item CRUD・精算など）を `/groups/:groupId` 配下に素直に追加できる

## Considered Options

- **認可の適用場所**: ①`rpc.ts` の `routes` 内にミドルウェアを書く / ②`Env` を持つ `index.ts` 側で `/groups/:groupId/*` に適用する
- **groupId の受け渡し**: パスパラメータ `/groups/:groupId/*` / クエリ・ボディ
- **Variables 型の置き場**: ルートファイルに同居 / 専用モジュールに一元化

## Decision Outcome

選んだ選択肢: 「**認可ミドルウェアは `index.ts` 側で適用し、ルート定義は Variables だけで型付けする**」。理由は、`Env`/`DB`/`auth` への依存を `Bindings` を持つ `index.ts` に閉じ込めれば、`rpc.ts` / ルートは Workers 固有型に触れずに済み、[ADR-0005](./0005-api-integration-hono-rpc.md) の原則を保てるため。

- **groupId**: パスパラメータ `/groups/:groupId/*` で受け取る。
- **ミドルウェア**: `requireAuth`（Better Auth の `auth.api.getSession` でセッション検証、未ログインは 401）と `requireGroupMember`（`group_member` を照会、非メンバーは 403）の 2 段。`src/middleware/` に factory 形式で配置し、将来のオプション（role 指定など）拡張に備える。
- **適用**: `index.ts` で `app.use("/groups/:groupId/*", requireAuth(), requireGroupMember())` を `app.route("/", routes)` より前に置く。
- **Variables 型**: `src/context.ts` に一元化する。`better-auth` の `Session`/`User` と Drizzle の `InferSelectModel` という Workers 非依存の純粋型のみで構成し、`AppType` に `Env`/`D1Database` が混入しないようにする。
- 保護ルート（`src/routes/groups.ts`）は `new Hono<{ Variables: GroupMemberVariables }>()` で `Bindings` を持たず宣言し、`rpc.ts` から `.route("/groups", ...)` で結合する。

### Consequences

- 良い点: 保護対象が `index.ts` の 1 行に集約され認可漏れしにくい。`rpc.ts` / ルートは Workers 固有型に非依存のままで、フロントエンドの `AppType` 解決が壊れない。後続ルートは `routes/groups.ts` に追加するだけで認可が効く。
- 悪い点 / トレードオフ: ミドルウェア（`index.ts` で注入）とルート（`routes/groups.ts` で宣言）が別の Hono インスタンスをまたぐため、両者の `Variables` 型一致はコンパイラが直接保証しない。`context.ts` を唯一の型ソースとする規約で担保し、`requireGroupMember` を単体でも安全に倒せるよう防御ガード（user 未設定時 401）を入れている。
- 注意: `requireGroupMember` は `requireAuth` の後段である前提（user を参照する）。適用順序は `index.ts` で固定する。

## More Information

- 実装は `apps/api/src/{context,index,rpc}.ts`、`apps/api/src/middleware/`、`apps/api/src/routes/groups.ts` を参照。
- 関連: [ADR-0005](./0005-api-integration-hono-rpc.md)（Hono RPC）, [ADR-0006](./0006-orm-drizzle-d1.md)（Drizzle/D1）, [ADR-0007](./0007-auth-better-auth.md)（Better Auth）。
- 認可の挙動（401/403/通過）は vitest-pool-workers でテストする（[ADR-0008](./0008-testing-strategy.md)）。
