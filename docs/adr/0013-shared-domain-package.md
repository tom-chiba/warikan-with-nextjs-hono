---
status: accepted
date: 2026-06-07
deciders: tom-chiba
---

# 精算ロジックを共有ドメインパッケージへ集約し、精算実行時にサーバー側で検証する

## Context and Problem Statement

割り勘アプリの核心である精算計算（収支集計・送金リスト算出）は `apps/web/src/lib/settle.ts` / `split.ts` にのみ存在し、API の精算エンドポイント（`POST /groups/:groupId/settlements`）は「指定された itemIds のステータスを settled に更新する」だけで送金リストの正しさを検証しない。フロントの計算にバグがあったり、表示中の一覧が古かったりしても、誤った送金リストを確認したまま精算が確定してしまう。計算の正しさという最重要の業務ルールが、検証されないクライアントコードだけに依存している。

## Decision Drivers

- 精算計算の「信頼の単一ソース」を作り、FE/BE で実装が乖離しない構造にしたい
- ユーザーが確認した送金リストと、サーバー上のデータから導かれる送金リストの一致を精算確定時に保証したい
- クイック入力画面（ルート `/` と items/new）の軽さ・バンドルサイズを損なわない（CLAUDE.md のパフォーマンス方針）
- モノレポ（[ADR-0001](./0001-monorepo-structure.md)）と Hono RPC（[ADR-0005](./0005-api-integration-hono-rpc.md)）の型共有の延長線で、追加のビルドステップを増やさない

## Considered Options

- **共有パッケージ `packages/domain` を新設し、計算ロジックを FE/BE で共有。精算 API はクライアントが表示した送金リストを受け取り、DB 上のデータから同じ関数で再計算して一致を検証する**
- API 側に計算ロジックを再実装して検証する（コードは複製）
- 計算を API 側へ完全に移し、フロントは表示のみ行う（選択変更のたびにサーバー往復）
- 現状維持（クライアント計算を信頼する）

## Decision Outcome

選んだ選択肢: 「**共有パッケージ `packages/domain` + 精算 API でのサーバー側検証**」。理由は、計算ロジックを 1 箇所に保ったまま（複製なし）、確定操作の瞬間にサーバー側データとの一致を保証できるため。選択操作のたびの往復は発生せず、クイック入力のパフォーマンス方針とも両立する。

- `packages/domain`（`@warikan/domain`）を新設し、`split.ts`（等分計算）・`settle.ts`（収支集計・送金リスト算出）とそのテスト、ドメイン型（`AmountEntry` / `SettlementItem` / `Transfer`）を `apps/web/src/lib` から移管する。
- パッケージは TypeScript ソースをそのまま公開する（`@warikan/api` の `AppType` 共有と同方式。ビルドステップなし）。web 側は `next.config.ts` の `transpilePackages` で取り込む。
- `POST /groups/:groupId/settlements` のリクエストを `{ itemIds }` から `{ itemIds, transfers }` に変更する。サーバーは対象アイテムの payments / shares を DB から読み、共有関数 `computeSettlements()` で再計算し、クライアントが送った `transfers` と完全一致しなければ **409 Conflict** で拒否する（一覧が古い・計算不一致の両方を検出）。
- 従来「存在しない / 精算済みの id は黙って無視」だった挙動は、「クライアントの見ている一覧が古い」シグナルとして 409 で拒否する方針に改める（巻き込み防止の WHERE 句は多重防御として維持）。
- `computeSettlements()` は入力順序に依存せず決定的（同額時は userId 順で安定）なため、FE/BE が同じデータから同じ結果を得ることが保証され、配列の単純比較で検証できる。

### Consequences

- 良い点: 送金リストの計算がパッケージ 1 箇所に集約され、FE/BE の実装乖離が構造的に起きない。
- 良い点: 精算確定時に「表示された送金リスト = サーバー上のデータから導かれる送金リスト」が保証される。古い一覧からの精算や計算バグの混入を確定前に検出できる。
- 良い点: 計算は引き続きクライアントで即時実行されるため、選択操作の応答性・初期表示の軽さは変わらない（`@warikan/domain` は依存ゼロの純粋関数のみで、バンドル増はごく小さい）。
- 悪い点 / トレードオフ: 精算 API のリクエスト形式が変わる破壊的変更。クライアントは web のみなので同一 PR で追従する。
- 悪い点 / トレードオフ: D1 は対話的トランザクション非対応のため、検証（SELECT）と更新（UPDATE）の間に他リクエストが割り込む余地は残る。UPDATE 側の `status = "unsettled"` / `groupId` 一致の WHERE 句を多重防御として維持し、許容する（[ADR-0010](./0010-db-injection-and-collection-routes.md) と同方針）。

## More Information

- Zod 入力スキーマの FE/BE 共有（フォームバリデーションの一元化）は本 ADR のスコープ外。`packages/domain` への zod 導入はクイック入力画面のバンドルサイズへの影響を計測したうえで、別 ADR として検討する。
- 送金回数を貪欲法で抑える方針は Issue #21 で確定済み。本 ADR はロジックの配置と検証方法のみを変更し、アルゴリズムは変更しない。
