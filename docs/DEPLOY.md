# デプロイ手順

- **api** → Cloudflare Workers + D1
- **web** → Vercel

api と web は URL を相互に参照するため（web は api の URL、api は web のオリジンを信頼）、
**api を先にデプロイ → web → 確定した URL を api に反映して再デプロイ**、の順で行う。

ローカル開発はクラウド不要（`pnpm dev`）。以下は本番デプロイ時のみ必要。

## 0. 前提

- Cloudflare アカウント / Vercel アカウント
- `wrangler` はプロジェクト依存に含まれる（`pnpm --filter @warikan/api exec wrangler ...`）

## 1. api（Cloudflare Workers + D1）

1. ログイン（対話）:
   ```
   ! pnpm --filter @warikan/api exec wrangler login
   ```
2. リモート D1 を作成し、出力された `database_id` を `apps/api/wrangler.jsonc` の
   `d1_databases[0].database_id`（現在はプレースホルダ）に設定:
   ```
   pnpm --filter @warikan/api exec wrangler d1 create warikan-db
   ```
3. リモート D1 にマイグレーション適用:
   ```
   pnpm --filter @warikan/api db:migrate:remote
   ```
4. シークレットを設定（git に入れない）:
   ```
   pnpm --filter @warikan/api exec wrangler secret put BETTER_AUTH_SECRET
   ```
   （32 バイト以上のランダム値。例: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`）
5. デプロイ（`deploy` は pnpm 組み込みコマンドと名前が衝突するため、必ず `run` を付ける）:
   ```
   pnpm --filter @warikan/api run deploy
   ```
   出力される Workers URL（例 `https://warikan-api.<subdomain>.workers.dev`）を控える。
   本番ではカスタムドメイン `warikan.api.tom-chiba.com` を Workers に割り当てる
   （Cloudflare ダッシュボード → Workers → Custom Domains）。

## 2. web（Vercel）

1. Vercel で新規プロジェクトを作成し、本リポジトリを連携。
2. プロジェクト設定:
   - **Root Directory**: `apps/web`
   - **Framework Preset**: Next.js（自動検出）
   - Install/Build は pnpm ワークスペースを Vercel が自動処理
3. 環境変数:
   - `NEXT_PUBLIC_API_URL` = api のカスタムドメイン `https://warikan.api.tom-chiba.com`
     （`NEXT_PUBLIC_` はビルド時にインライン化されるため、変更時は再デプロイが必要）
4. デプロイ後、カスタムドメイン `warikan.tom-chiba.com` を Vercel プロジェクトに割り当てる
   （Vercel → Project → Settings → Domains）。

## 3. URL を相互反映（相互依存の解消）

`apps/api/wrangler.jsonc` の `vars` に、確定した URL を設定する（非機密のため commit 可）。
**注意**: これらの top-level `vars` は `wrangler dev`（ローカル/CI の E2E）にも適用される。
ローカル/CI では `.dev.vars` の `WEB_ORIGIN=http://localhost:3000` / `BETTER_AUTH_URL=http://localhost:8787`
で必ず上書きすること（`.dev.vars` が `vars` より優先される）。CI は e2e ジョブでこの `.dev.vars` を生成している。

```jsonc
"vars": {
  "BETTER_AUTH_URL": "https://warikan.api.tom-chiba.com",
  "WEB_ORIGIN": "https://warikan.tom-chiba.com"
}
```

- `WEB_ORIGIN` は CORS と Better Auth の `trustedOrigins` に使われる。
  複数許可する場合はカンマ区切り（例: 本番 + 任意の preview）。
- Vercel の preview デプロイは URL が動的なので、preview からも認証を使うなら
  該当オリジン（またはワイルドカード運用）を `WEB_ORIGIN` に追加する。
- **same-site Cookie**: web (`warikan.tom-chiba.com`) と api (`warikan.api.tom-chiba.com`) は
  登録ドメインが共通（`tom-chiba.com`）なので same-site。セッション Cookie は Better Auth 既定の
  `SameSite=Lax` のまま same-site 扱いの fetch で送信されるため、`SameSite=None` や
  `crossSubDomainCookies` の設定は不要（Cookie は api ホスト限定の host-only のままで安全）。
  オリジン自体は別なので CORS（`credentials: true`）は引き続き必要。

設定後、api を再デプロイ:

```
pnpm --filter @warikan/api run deploy
```

## 環境変数まとめ

| 変数                  | 用途                   | ローカル                      | 本番                  |
| --------------------- | ---------------------- | ----------------------------- | --------------------- |
| `BETTER_AUTH_SECRET`  | セッション署名（機密） | `apps/api/.dev.vars`          | `wrangler secret put` |
| `BETTER_AUTH_URL`     | api 自身の公開 URL     | `.dev.vars`（localhost:8787） | wrangler.jsonc `vars` |
| `WEB_ORIGIN`          | 許可する web オリジン  | 未設定（localhost:3000 既定） | wrangler.jsonc `vars` |
| `NEXT_PUBLIC_API_URL` | web→api の宛先         | 未設定（localhost:8787 既定） | Vercel 環境変数       |

## 確認

- `pnpm --filter @warikan/api build`（`wrangler deploy --dry-run`）でバンドル検証。
- デプロイ後、web からサインアップ→ログインが通ること（CORS / trustedOrigins / クッキー）。
