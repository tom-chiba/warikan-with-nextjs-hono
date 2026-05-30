---
status: accepted
date: 2026-05-30
deciders: tom-chiba
---

# モノレポ構成の採用（pnpm workspace, apps/ + packages/）

## Context and Problem Statement

本プロジェクトはフロントエンド（Next.js / Vercel）とバックエンド（Hono / Cloudflare Workers）の 2 つのデプロイ単位を持つ。両者をどのように構成・管理するかを決める必要がある。とくに後述の Hono RPC（[ADR-0005](./0005-api-integration-hono-rpc.md)）では、BE が公開する型を FE が直接 import して共有するため、型の参照しやすさが重要になる。

## Decision Drivers

- FE と BE で型（および将来的な共有コード）を低コストで共有したい
- デプロイ先は FE=Vercel、BE=Cloudflare Workers と異なるため、アプリ単位で独立して扱えること
- 個人開発であり、ツール構成はできるだけシンプルに保ちたい

## Considered Options

- **pnpm モノレポ（`apps/*` + `packages/*`）**
- **pnpm モノレポ（`apps/*` のみ、`packages/` は作らない）**
- **リポジトリ分割（FE と BE を別リポジトリ）**

## Decision Outcome

選んだ選択肢: 「**pnpm モノレポ（`apps/*` + `packages/*`）**」。理由は、Hono RPC による型共有がワークスペース依存（`workspace:*`）で最も素直に実現でき、将来の共有パッケージ（型・ユーティリティ等）も `packages/` に追加しやすいため。

ディレクトリ構成:

```
warikan-with-nextjs-hono/
├── apps/
│   ├── web/   # Next.js (App Router) → Vercel
│   └── api/   # Hono → Cloudflare Workers
├── packages/  # 共有パッケージ（必要に応じて追加）
├── package.json          # ルート: 横断ツール（Oxc 等）とスクリプトの集約
└── pnpm-workspace.yaml
```

ルートの `package.json` はコードを置く場所ではなく、ワークスペース全体の「束ね役」（`private: true`、`packageManager`、横断 lint/format スクリプト）とする。

### Consequences

- 良い点: `@warikan/api` が公開する `AppType` を `@warikan/web` から `workspace:*` 依存で参照でき、型安全な RPC が成立する。
- 良い点: lint/format などの横断ツールをルートに集約し、1 コマンドで全体に適用できる。
- 悪い点 / トレードオフ: 単一リポジトリのため、デプロイ単位ごとの CI/権限分離はリポジトリ分割より一手間増える。Vercel / Cloudflare 側でビルド対象ディレクトリを明示する必要がある。

## More Information

- `packages/` は当初空でよい。共有したいコードが生じた時点で追加する。
