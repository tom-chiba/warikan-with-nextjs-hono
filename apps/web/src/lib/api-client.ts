import type { AppType } from "@warikan/api";
import { hc } from "hono/client";

// apps/api が公開する AppType を共有し、型安全な RPC クライアントを生成する。
// 本番では NEXT_PUBLIC_API_URL を設定し、未設定時はローカルの wrangler dev を指す。
const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

// 保護ルート（/groups 等）は Better Auth のセッション Cookie で認可するため、
// 別オリジンへのリクエストでも Cookie を送るよう credentials: "include" を全リクエストに付与する。
export const apiClient = hc<AppType>(baseUrl, { init: { credentials: "include" } });

// 未ログイン（401）での失敗。セッション解決を待たずに並列発火するクエリ（use-groups.ts）では
// 正常系の一種なので、QueryClient の既定（providers.tsx）でリトライ対象から除外する。
// サインイン後の再取得は SessionCacheBoundary の invalidate が担う。
export class UnauthorizedError extends Error {}
