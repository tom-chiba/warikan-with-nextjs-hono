// `.dev.vars`（ローカル）や `wrangler secret`（本番）で注入される値を、Env に常に型付けする。
// 生成物 worker-configuration.d.ts は .dev.vars の有無で内容が変わり CI では欠落するため、
// ここで明示的に宣言マージしておく（環境差で型が変わらないようにする）。
interface Env {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  // 許可するフロントエンドのオリジン（CORS / trustedOrigins）。未設定なら localhost:3000。
  // カンマ区切りで複数指定可。
  WEB_ORIGIN?: string;
}
