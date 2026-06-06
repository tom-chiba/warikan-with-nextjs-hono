import { Hono } from "hono";
import { groups } from "./routes/groups";
import { groupsCollection } from "./routes/groups-collection";
import { invitations } from "./routes/invitations";
import { items } from "./routes/items";

// 型安全な RPC ルート。auth/db など Workers 固有のグローバル型（Env / D1Database）に
// 依存させないことで、フロントエンド側が AppType を import しても型解決が完結する。
// 保護ルート（groups）の認可ミドルウェアは index.ts 側で適用するため、ここでは型だけを結合する。
export const routes = new Hono()
  .get("/", (c) => c.json({ message: "warikan API" }))
  .route("/groups", groups)
  .route("/groups", groupsCollection)
  .route("/groups", items)
  .route("/invitations", invitations);

export type AppType = typeof routes;
