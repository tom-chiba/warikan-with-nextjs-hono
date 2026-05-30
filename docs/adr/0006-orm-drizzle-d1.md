---
status: accepted
date: 2026-05-30
deciders: tom-chiba
---

# D1 へのアクセスに Drizzle ORM を採用

## Context and Problem Statement

バックエンド（Cloudflare Workers）から D1（SQLite ベース）にアクセスする手段を決める。型安全なクエリ、スキーマ定義、マイグレーション管理が必要で、かつ認証基盤（[ADR-0007](./0007-auth-better-auth.md)）のデータベースアダプタとして利用できることが望ましい。

## Decision Drivers

- D1 / Workers 環境で動作すること
- 型安全なクエリとスキーマ定義ができること
- マイグレーションの生成・適用フローが用意できること
- Better Auth のデータベースアダプタが存在すること

## Considered Options

- **Drizzle ORM**（`drizzle-orm/d1` + `drizzle-kit`）
- **Kysely**（型安全なクエリビルダ、D1 ダイアレクトあり）
- **生 SQL**（D1 の API を直接利用）

## Decision Outcome

選んだ選択肢: 「**Drizzle ORM**」。理由は、D1 専用エントリ（`drizzle-orm/d1`）があり、型安全なスキーマ定義から `drizzle-kit` でマイグレーションを生成でき、Better Auth の公式 Drizzle アダプタもあるため、認証と業務ロジックの双方を同一の仕組みで扱えること。

- DB クライアント: `createDb(d1)` で `drizzle(d1, { schema })` を**リクエストごとに生成**（Workers は D1 バインディングがリクエスト毎に渡るため、[ADR-0007](./0007-auth-better-auth.md) と同様）。
- スキーマ: `apps/api/src/db/schema.ts` に Drizzle で定義。
- マイグレーション: `drizzle-kit generate` で SQL を生成し、`wrangler d1 migrations apply`（`--local` / `--remote`）で D1 に適用する。

### Consequences

- 良い点: スキーマからの型推論が効き、Better Auth との連携も公式アダプタで済む。
- 良い点: マイグレーションがバージョン管理可能な SQL として `drizzle/` に残る。
- 悪い点 / トレードオフ: 「生成（drizzle-kit）」と「適用（wrangler d1 migrations）」でツールが分かれる。drizzle の journal と wrangler の適用追跡が別管理になるが、生成専用・適用専用と役割を割り切って運用する。

## More Information

- 適用は `db:generate` → `db:migrate:local` / `db:migrate:remote` スクリプトに集約。
- 業務ドメイン（グループ・支出等）のテーブルも同じ schema.ts に追加していく。
