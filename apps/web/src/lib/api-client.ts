import type { AppType } from "@warikan/api";
import { hc } from "hono/client";

// apps/api が公開する AppType を共有し、型安全な RPC クライアントを生成する。
// 本番では NEXT_PUBLIC_API_URL を設定し、未設定時はローカルの wrangler dev を指す。
const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

// 保護ルート（/groups 等）は Better Auth のセッション Cookie で認可するため、
// 別オリジンへのリクエストでも Cookie を送るよう credentials: "include" を全リクエストに付与する。
export const apiClient = hc<AppType>(baseUrl, { init: { credentials: "include" } });
