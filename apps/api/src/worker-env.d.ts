// `.dev.vars`（ローカル）や `wrangler secret`（本番）で注入される値を、Env に常に型付けする。
// 生成物 worker-configuration.d.ts は .dev.vars の有無で内容が変わり CI では欠落するため、
// ここで明示的に宣言マージしておく（環境差で型が変わらないようにする）。
interface Env {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  // 許可するフロントエンドのオリジン（CORS / trustedOrigins）。未設定なら localhost:3000。
  // カンマ区切りで複数指定可。
  WEB_ORIGIN?: string;
  // Resend の API キー（機密 / #70）。本番は `wrangler secret put RESEND_API_KEY`。
  // 未設定なら実送信せず console 出力にフォールバックする（ローカル開発・テスト）。
  RESEND_API_KEY?: string;
  // 送信元アドレス（非機密）。本番は wrangler.jsonc の vars。例: no-reply@tom-chiba.com。
  RESEND_FROM?: string;
  // テスト時のみ "1" を注入するフラグ（#70）。送信内容をインメモリ受信箱に記録し、
  // /__test__/* エンドポイントを有効化する。本番 wrangler.jsonc には絶対に追加しないこと。
  EMAIL_TEST_INBOX?: string;
  // テスト時のみ vitest.config.ts の miniflare.bindings で注入するフラグ(#42)。
  // "1" のときだけパスワードハッシュを scrypt から SHA-256 に差し替えてテストを高速化する。
  // 本番の wrangler.jsonc の vars / wrangler secret には絶対に追加しないこと。
  TEST_HASH?: string;
}
