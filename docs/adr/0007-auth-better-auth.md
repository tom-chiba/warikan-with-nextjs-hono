---
status: accepted
date: 2026-05-30
deciders: tom-chiba
---

# 認証に Better Auth を採用（メール + パスワード）

## Context and Problem Statement

ユーザー認証の仕組みを決める。実行環境は Cloudflare Workers + D1（[ADR-0006](./0006-orm-drizzle-d1.md)）で、まずはメール + パスワードで最小限に立ち上げ、将来的にソーシャルログイン等へ拡張できることが望ましい。

## Decision Drivers

- Cloudflare Workers + D1 上で動作すること
- Drizzle アダプタがあり、スキーマ/DB を一元管理できること
- メール + パスワードで開始し、後からプロバイダを追加できる拡張性
- セッション管理（クッキー）を含めて提供されること

## Considered Options

- **Better Auth**
- **Auth.js (NextAuth)**
- **自前実装**（パスワードハッシュ + セッション管理を独自に）

## Decision Outcome

選んだ選択肢: 「**Better Auth**」。理由は、Workers / D1 / Drizzle との組み合わせ事例が多く、メール + パスワードからソーシャルまで拡張でき、セッションまで含めて提供されるため。

実装上の要点:

- **リクエストごとに `createAuth(env)` を生成**する。Workers では D1 バインディングと secret が実行時 env からリクエスト毎に渡るため、auth インスタンスをシングルトンにできない。
- **スキーマは公式コアスキーマに従って手書き**する（CLI 生成に依存しない）。`@better-auth/cli` はコアより版が古く、env 依存の auth 設定を CLI に読み込ませる必要があり、`minimumReleaseAge`（[ADR-0004](./0004-supply-chain-hardening.md)）下の dlx とも噛み合いにくいため、再現性を優先して手書きとした。
- **マウント位置**: `/api/auth/*` に `app.on([...], (c) => createAuth(c.env).handler(c.req.raw))` で配置。これは catch-all のため Hono RPC の型付きルート（[ADR-0005](./0005-api-integration-hono-rpc.md)）には含めない。フロントエンドは Better Auth のクライアントから利用する。
- `nodejs_compat` を有効化（Better Auth が `node:crypto` 等を使用）。secret/baseURL は env（ローカルは `.dev.vars`、本番は `wrangler secret`）から渡す。

### Consequences

- 良い点: メール + パスワードを最小設定で導入でき、ローカルで sign-up / sign-in / 認証失敗(401) / D1 永続化まで確認済み。
- 良い点: 認証テーブルも Drizzle スキーマに含まれ、業務テーブルと同じマイグレーションフローで扱える。
- 悪い点 / トレードオフ: リクエスト毎に auth インスタンスを生成するコストがある（Workers では許容範囲）。
- 悪い点 / トレードオフ: スキーマ手書きのため、プラグイン追加などで Better Auth が要求するスキーマが変わった際は手動で同期する必要がある。

## More Information

- ソーシャルログインを追加する際は、プロバイダ設定とスキーマ差分を本 ADR への追補または新規 ADR で扱う。
- リモート D1 の作成・本番シークレット設定はデプロイ前の未対応作業として残っている。
