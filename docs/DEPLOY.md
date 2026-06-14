# デプロイ構成

- **api** → Cloudflare Workers + D1
- **web** → Vercel

## 日常のデプロイは自動（手動作業なし）

main へのマージ後、CI（check + e2e）の成功をトリガーに `.github/workflows/deploy.yml` が
**D1 マイグレーション適用 → api デプロイ** を自動実行する（GitHub Secrets の
`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` を使用）。web は Vercel の
GitHub 連携が main へのマージで自動デプロイする。

- マイグレーションは「旧コードが新スキーマで動ける」後方互換を前提に、デプロイ前に適用される
- 以下は**初回の環境構築**と、構成変更時に必要な知識のみを記す

## 初期構築（一度だけ）

### api（Cloudflare Workers + D1）

1. ログイン（対話）:
   ```
   ! pnpm --filter @warikan/api exec wrangler login
   ```
2. リモート D1 を作成し、出力された `database_id` を `apps/api/wrangler.jsonc` の
   `d1_databases[0].database_id` に設定:
   ```
   pnpm --filter @warikan/api exec wrangler d1 create warikan-db
   ```
3. シークレットを設定（git に入れない）:
   ```
   pnpm --filter @warikan/api exec wrangler secret put BETTER_AUTH_SECRET
   ```
   （32 バイト以上のランダム値。例: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`）
4. GitHub リポジトリの Secrets に `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` を設定
   （deploy.yml が使用。以後のマイグレーション適用とデプロイは自動）。
5. カスタムドメイン `warikan.api.tom-chiba.com` を Workers に割り当てる
   （Cloudflare ダッシュボード → Workers → Custom Domains）。

### メール送信（Resend / #70・ADR-0015）

トランザクションメール（パスワード再設定 #68・メール検証 #69 の前提）を Resend で送る。
`RESEND_API_KEY` が未設定の環境（ローカル・テスト）では実送信せず console 出力にフォールバックする。

1. Resend にルートドメイン `tom-chiba.com` を追加（Resend ダッシュボード → Domains → Add Domain）。
   - 無料プランは検証済みドメイン1つまで。ルートを登録し `*@tom-chiba.com` のローカルパートを
     アプリごとに変える（warikan は `no-reply@tom-chiba.com`）ことで、複数の個人開発アプリで
     1 ドメイン枠を共用する。MX/SPF は `send.tom-chiba.com` サブドメインに付くため、web 配信用の
     A/AAAA やルートドメインでのメール受信には干渉しない。
2. 提示された DNS レコード（SPF の TXT・DKIM・任意で MX/DMARC）を **Cloudflare DNS** に登録し、
   Resend 側で「Verified」になるまで待つ。
   - 送信元 `RESEND_FROM`（`no-reply@tom-chiba.com`）は `apps/api/wrangler.jsonc` の `vars`
     に置く（非機密）。別アドレスにする場合はここを変更する。
3. API キーを発行（Resend → API Keys）し、機密として登録（git に入れない）:
   ```
   pnpm --filter @warikan/api exec wrangler secret put RESEND_API_KEY
   ```

#### 本番からの実送信を一度だけ検証する

`/__test__/*` は `EMAIL_TEST_INBOX=1` のときだけ有効化される（本番 `wrangler.jsonc` には置かないため通常は 404）。
実送信を検証したいときだけ一時的に有効化し、確認後に閉じる:

```
# 一時的にフラグを立てる（値は 1）
pnpm --filter @warikan/api exec wrangler secret put EMAIL_TEST_INBOX
# デプロイ済みの api に実送信させる（自分のメールアドレス宛）
curl -X POST https://warikan.api.tom-chiba.com/__test__/send \
  -H 'Content-Type: application/json' \
  -d '{"to":"you@example.com"}'
# 受信を確認したらフラグを削除してエンドポイントを閉じる
pnpm --filter @warikan/api exec wrangler secret delete EMAIL_TEST_INBOX
```

> 注意: `EMAIL_TEST_INBOX` を本番に立てている間は `/__test__/send`（任意宛先への送信）と
> `/__test__/emails`（送信履歴の閲覧）が露出する。検証が終わったら必ず削除すること。

### web（Vercel）

1. Vercel で新規プロジェクトを作成し、本リポジトリを連携。
   - **Root Directory**: `apps/web`
   - **Framework Preset**: Next.js（自動検出）。Install/Build は pnpm ワークスペースを Vercel が自動処理
2. 環境変数:
   - `NEXT_PUBLIC_API_URL` = api のカスタムドメイン `https://warikan.api.tom-chiba.com`
     （`NEXT_PUBLIC_` はビルド時にインライン化されるため、変更時は再デプロイが必要）
3. カスタムドメイン `warikan.tom-chiba.com` を Vercel プロジェクトに割り当てる
   （Vercel → Project → Settings → Domains）。

### URL の相互反映

`apps/api/wrangler.jsonc` の `vars` に、確定した URL を設定する（非機密のため commit 可）。

```jsonc
"vars": {
  "BETTER_AUTH_URL": "https://warikan.api.tom-chiba.com",
  "WEB_ORIGIN": "https://warikan.tom-chiba.com"
}
```

**注意**: これらの top-level `vars` は `wrangler dev`（ローカル/CI の E2E）にも適用される。
ローカル/CI では `.dev.vars` の `WEB_ORIGIN=http://localhost:3000` / `BETTER_AUTH_URL=http://localhost:8787`
で必ず上書きすること（`.dev.vars` が `vars` より優先される）。CI は e2e ジョブでこの `.dev.vars` を生成している。

- `WEB_ORIGIN` は CORS と Better Auth の `trustedOrigins` に使われる。
  複数許可する場合はカンマ区切り（例: 本番 + 任意の preview）。
- Vercel の preview デプロイは URL が動的なので、preview からも認証を使うなら
  該当オリジン（またはワイルドカード運用）を `WEB_ORIGIN` に追加する。
- **same-site Cookie**: web (`warikan.tom-chiba.com`) と api (`warikan.api.tom-chiba.com`) は
  登録ドメインが共通（`tom-chiba.com`）なので same-site。セッション Cookie は Better Auth 既定の
  `SameSite=Lax` のまま same-site 扱いの fetch で送信されるため、`SameSite=None` や
  `crossSubDomainCookies` の設定は不要（Cookie は api ホスト限定の host-only のままで安全）。
  オリジン自体は別なので CORS（`credentials: true`）は引き続き必要。

## 環境変数まとめ

| 変数                  | 用途                    | ローカル                       | 本番                         |
| --------------------- | ----------------------- | ------------------------------ | ---------------------------- |
| `BETTER_AUTH_SECRET`  | セッション署名（機密）  | `apps/api/.dev.vars`           | `wrangler secret put`        |
| `BETTER_AUTH_URL`     | api 自身の公開 URL      | `.dev.vars`（localhost:8787）  | wrangler.jsonc `vars`        |
| `WEB_ORIGIN`          | 許可する web オリジン   | 未設定（localhost:3000 既定）  | wrangler.jsonc `vars`        |
| `RESEND_API_KEY`      | Resend API キー（機密） | `.dev.vars`（空=実送信しない） | `wrangler secret put`        |
| `RESEND_FROM`         | メール送信元アドレス    | wrangler.jsonc `vars`          | wrangler.jsonc `vars`        |
| `EMAIL_TEST_INBOX`    | `/__test__/*` 有効化    | `.dev.vars`（`1`）             | 未設定（検証時のみ一時設定） |
| `NEXT_PUBLIC_API_URL` | web→api の宛先          | 未設定（localhost:8787 既定）  | Vercel 環境変数              |

## 注意: `packages/domain` の計算ロジックを変更するリリース

精算確定時、api は web が提示した送金リストを `@warikan/domain` の `computeSettlements()` で
再計算して**完全一致**を検証する（ADR-0013）。web（Vercel）と api（Cloudflare）は独立に
デプロイされるため、送金リストの出力に影響する変更（送金回数最小化のアルゴリズム・
同額時のタイブレーク順など）を含むリリースでは、**両者が異なるバージョンで動く時間帯に
精算が 409 になり得る**（エラー文言は「一覧を最新に」だがリロードでは解消しない）。

- アルゴリズム変更を含むリリースは利用の少ない時間帯にマージする（api → web の順で自動デプロイされる）
- スキュー中の精算失敗は一時的で、両者が揃えば解消する
- 入出力が変わらないリファクタリングはこの限りではない
