# Architecture Decision Records (ADR)

このディレクトリには、本プロジェクトのアーキテクチャ上の意思決定を記録する。
形式は [MADR](https://adr.github.io/madr/)（Markdown Any Decision Records）に準拠する。

## 運用ルール

- 1 つの決定につき 1 ファイル。`NNNN-kebab-case-title.md` の形式で連番を振る。
- 新規作成時は [`template.md`](./template.md) をコピーして使う。
- ステータスは `proposed` → `accepted` → （必要に応じて）`deprecated` / `superseded` と遷移させる。
- 既存の決定を覆す場合は、新しい ADR を作成し、古い ADR の Status を `superseded by ADR-NNNN` に更新する（履歴は消さない）。

## 一覧

| #    | タイトル                                                                                           | Status   |
| ---- | -------------------------------------------------------------------------------------------------- | -------- |
| 0001 | [モノレポ構成の採用](./0001-monorepo-structure.md)                                                 | accepted |
| 0002 | [mise による開発ツールのバージョン管理](./0002-toolchain-mise-pnpm-node.md)                        | accepted |
| 0003 | [Lint / Format に Oxc を採用](./0003-lint-format-oxc.md)                                           | accepted |
| 0004 | [pnpm によるサプライチェーン対策](./0004-supply-chain-hardening.md)                                | accepted |
| 0005 | [API 連携に Hono RPC を採用](./0005-api-integration-hono-rpc.md)                                   | accepted |
| 0006 | [D1 へのアクセスに Drizzle ORM を採用](./0006-orm-drizzle-d1.md)                                   | accepted |
| 0007 | [認証に Better Auth を採用](./0007-auth-better-auth.md)                                            | accepted |
| 0008 | [テスト戦略](./0008-testing-strategy.md)                                                           | accepted |
| 0009 | [グループ単位の認可レイヤの構成](./0009-group-authorization-layer.md)                              | accepted |
| 0010 | [ハンドラへの DB 注入とコレクションルートの認可](./0010-db-injection-and-collection-routes.md)     | accepted |
| 0011 | [アカウント削除（退会）と孤児グループの掃除](./0011-account-deletion.md)                           | accepted |
| 0012 | [テスト専用パスワードハッシャーによる api テストの高速化](./0012-test-password-hasher.md)          | accepted |
| 0013 | [精算ロジックの共有ドメインパッケージ化とサーバー側検証](./0013-shared-domain-package.md)          | accepted |
| 0014 | [React Compiler による自動メモ化の採用](./0014-react-compiler.md)                                  | accepted |
| 0015 | [メール送信基盤（Resend + 薄い抽象 + テスト受信箱）の採用](./0015-email-sending-infrastructure.md) | accepted |
| 0016 | [パスワード再設定（Better Auth + メール送信基盤）の採用](./0016-password-reset.md)                 | accepted |
