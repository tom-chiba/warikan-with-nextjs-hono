---
status: accepted
date: 2026-05-30
deciders: tom-chiba
---

# API 連携に Hono RPC を採用（OpenAPI / Swagger / Orval は不採用）

## Context and Problem Statement

フロントエンド（`apps/web`）とバックエンド（`apps/api`）間の API 連携方式を決める。当初は OpenAPI スキーマを定義し、Swagger でドキュメント化、Orval で FE のクライアント/型を生成する構成を検討していた。モノレポ（[ADR-0001](./0001-monorepo-structure.md)）であることを踏まえ、型安全性とシンプルさのバランスを見直す。

## Decision Drivers

- FE / BE 間の型安全性を高くしたい
- コード生成や別フォーマット（OpenAPI YAML）の維持といった中間ステップは少ないほどよい
- モノレポで TypeScript を共有できる利点を活かしたい

## Considered Options

- **Hono RPC**（BE が公開する `AppType` を FE が import し、`hc<AppType>()` で型安全なクライアントを得る）
- **OpenAPI + Swagger + Orval**（スキーマ駆動でドキュメントとクライアントを生成）
- **両者の併用**（`@hono/zod-openapi` で RPC とドキュメントを両立）

## Decision Outcome

選んだ選択肢: 「**Hono RPC**」。理由は、モノレポでは BE の型を直接共有でき、コード生成ステップ無しで FE/BE 間の型安全性が成立するため。当初検討していた OpenAPI / Swagger / Orval は採用しない。

- 型共有: `apps/web` が `@warikan/api` を `workspace:*` 依存として参照し、`AppType` を import。
- クライアント: `hc<AppType>(baseUrl)` を生成し、TanStack Query の `queryFn` 内の fetch 層として用いる。
- リクエスト検証: `@hono/zod-validator` + Zod。
- ブラウザで閲覧できる API ドキュメント UI は持たない（純粋な RPC のみ）。

## Consequences

- 良い点: スキーマ定義やクライアント生成の中間ステップが無く、BE の変更が即座に FE の型に反映される。
- 良い点: 単一の TypeScript 型を信頼の源とでき、OpenAPI と実装の乖離が起きない。
- 悪い点 / トレードオフ: ブラウザで見られる API ドキュメント（Swagger UI）が無い。外部公開 API や他言語クライアントが必要になった場合は不利。
- 悪い点 / トレードオフ: FE が BE の型に直接依存するため、両者は同一リポジトリ（モノレポ）であることが前提になる。大規模化時は型解決の TypeScript パフォーマンスに留意が必要（必要なら BE 型の事前コンパイルを検討）。

## More Information

- 将来、外部公開 API やサードパーティ向けドキュメントが必要になった場合は、`@hono/zod-openapi` での併用、または本 ADR の見直しを行う。
