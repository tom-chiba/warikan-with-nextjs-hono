---
status: accepted
date: 2026-05-30
deciders: tom-chiba
---

# テスト戦略（Vitest + RTL / vitest-pool-workers / Playwright）

## Context and Problem Statement

モノレポ（[ADR-0001](./0001-monorepo-structure.md)）の web（Next.js）と api（Hono on Workers + D1）の双方、および両者をまたぐ動作をテストする方針を決める。とくに api は D1（[ADR-0006](./0006-orm-drizzle-d1.md)）や Better Auth（[ADR-0007](./0007-auth-better-auth.md)）が実行時 env に依存するため、本番に近い形で検証できるかが論点になる。

## Decision Drivers

- 各層を適切な粒度でテストできること（ユニット / 結合 / E2E）
- api は実 Workers ランタイム（workerd）と D1 を使い、モックでは見落とす差異を捉えられること
- web→api をまたぐ統合（CORS・クロスオリジン等）を実ブラウザで検証できること
- 既存のツール方針（Vitest / React Testing Library / Playwright）に沿うこと

## Considered Options

- api のテスト実行環境: **vitest-pool-workers（実 workerd + D1）** vs **node + モック**
- 全体構成: **3 層（web ユニット / api 結合 / E2E）** vs ユニットのみ

## Decision Outcome

選んだ選択肢: 「**3 層構成。api は vitest-pool-workers**」。

- **web**: Vitest + React Testing Library（jsdom）。コンポーネント/ユニット。
- **api**: Vitest + `@cloudflare/vitest-pool-workers`。実 workerd 上で動かし、`readD1Migrations` + `applyD1Migrations` でテスト用 D1 にマイグレーションを適用。`SELF.fetch` でルートと Better Auth を検証する。
- **E2E**: Playwright（ルートに配置）。`webServer` で api(:8787)/web(:3000) の dev を起動し、実ブラウザで通しを検証する。
- ルートスクリプト: `pnpm test`（web + api のユニット/結合）、`pnpm e2e`（Playwright）。

### Consequences

- 良い点: api テストが本番に近い（D1 バインディング・workerd・Better Auth を実体で検証）。実際に E2E が「RPC ルートに CORS が無く実ブラウザで弾かれる」問題を検出できた（モック/サーバ間テストでは見えなかった）。
- 悪い点 / トレードオフ: `@cloudflare/vitest-pool-workers` は Vitest 4 で API が変わり（`defineWorkersConfig` 廃止 → `cloudflareTest()` プラグイン方式）、公式ドキュメントの v3 手順は使えない。設定は v4 方式で記述する。
- 悪い点 / トレードオフ: E2E は両 dev サーバの起動を伴うため起動コストが大きい（ローカルで分単位）。CI では別ジョブ化を検討する。
- 注意: test ファイルと各 vitest 設定は `tsc --noEmit`（typecheck）の対象に含めていない（`cloudflare:test` 等の特殊型を main tsconfig に混ぜないため）。型の最終的な担保は各テスト実行で行う。

## More Information

- vitest-pool-workers v4 の構成詳細は `apps/api/vitest.config.ts` を参照。
- E2E をまたぐ CORS は api 側で全ルートに適用済み（[ADR-0007](./0007-auth-better-auth.md) の認証用 CORS を含め一本化）。
