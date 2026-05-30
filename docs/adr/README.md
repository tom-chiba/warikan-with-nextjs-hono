# Architecture Decision Records (ADR)

このディレクトリには、本プロジェクトのアーキテクチャ上の意思決定を記録する。
形式は [MADR](https://adr.github.io/madr/)（Markdown Any Decision Records）に準拠する。

## 運用ルール

- 1 つの決定につき 1 ファイル。`NNNN-kebab-case-title.md` の形式で連番を振る。
- 新規作成時は [`template.md`](./template.md) をコピーして使う。
- ステータスは `proposed` → `accepted` → （必要に応じて）`deprecated` / `superseded` と遷移させる。
- 既存の決定を覆す場合は、新しい ADR を作成し、古い ADR の Status を `superseded by ADR-NNNN` に更新する（履歴は消さない）。

## 一覧

| #    | タイトル                                                                    | Status   |
| ---- | --------------------------------------------------------------------------- | -------- |
| 0001 | [モノレポ構成の採用](./0001-monorepo-structure.md)                          | accepted |
| 0002 | [mise による開発ツールのバージョン管理](./0002-toolchain-mise-pnpm-node.md) | accepted |
| 0003 | [Lint / Format に Oxc を採用](./0003-lint-format-oxc.md)                    | accepted |
| 0004 | [pnpm によるサプライチェーン対策](./0004-supply-chain-hardening.md)         | accepted |
| 0005 | [API 連携に Hono RPC を採用](./0005-api-integration-hono-rpc.md)            | accepted |
