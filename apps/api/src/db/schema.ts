import { ITEM_KINDS } from "@warikan/domain";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Better Auth のコアスキーマ（メール + パスワード）を Drizzle(SQLite/D1) で定義する。
// プロパティ名は Better Auth のフィールド名（camelCase）に一致させ、
// 列名は SQL 慣習の snake_case とする。
// 参照: https://www.better-auth.com/docs/concepts/database

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// Better Auth の passkey プラグイン（@better-auth/passkey）が要求するテーブル（#90）。
// パスキー（WebAuthn credential）1 個 ↔ user 1 人は 1 対 1、user 1 人 ↔ passkey は 1 対多。
// userId は user.id を CASCADE 参照し、退会時にパスキーも一緒に消える。
// フィールド名（camelCase）は passkey プラグインの Passkey 型に厳密に一致させること
//（credentialID の大文字 ID など）。列名は他テーブルと同じく snake_case とする。
export const passkey = sqliteTable(
  "passkey",
  {
    id: text("id").primaryKey(),
    // 端末・認証器を見分けるための表示名（登録時に付与。未指定なら user.email/id にフォールバック）。
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // 認証器が発行する credential の識別子。サインイン時にこの値で行を引くため索引を張る。
    credentialID: text("credential_id").notNull(),
    // 署名カウンタ（リプレイ検出用）。検証のたびに更新される。
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: integer("backed_up", { mode: "boolean" }).notNull(),
    // 利用可能なトランスポート（"usb,nfc,ble,internal" 等のカンマ区切り文字列）。
    transports: text("transports"),
    // プラグインは作成時刻を渡すが、Passkey 型では optional 扱いのため null も許容しつつ既定値を持つ。
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
    // 認証器モデルを示す GUID（プライバシー保護端末は全 0 を返す）。管理 UI のラベル付けに使う。
    aaguid: text("aaguid"),
  },
  // list-user-passkeys は userId で、サインイン時の照合は credentialID で引くため、双方に索引を張る。
  (t) => [
    index("passkey_user_id_idx").on(t.userId),
    index("passkey_credential_id_idx").on(t.credentialID),
  ],
);

// ── 割勘ドメインスキーマ ──────────────────────────────────────────────
// id は text 主キー + crypto.randomUUID() を Workers ランタイムで生成する
//（Better Auth の user 等は自前で id を生成するため $defaultFn を持たないが、
//  ドメインテーブルは挿入側が id を意識せず済むようデフォルト生成を持たせる）。
// 金額は整数（円）。timestamp は Unix epoch（integer mode:"timestamp"）。

export const group = sqliteTable("group", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

// メンバーは全員アカウント必須（1 メンバー = 1 ユーザー）。userId は user.id を参照する。
// (groupId, userId) を複合主キーとし、同一グループでの重複所属を防ぐ。
export const groupMember = sqliteTable(
  "group_member",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => group.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "member"] })
      .notNull()
      .default("member"),
    joinedAt: integer("joined_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    // ユーザーがこのグループを最後に開いた（選択した）時刻。最大の行がカレントグループになる（#51）。
    // メンバーシップ行に持たせることで、脱退時は行ごと消えて無効なカレント参照が残らない。
    // 秒精度だと素早いグループ切替で同値（タイ）になり順序が不定になるため、ミリ秒精度で持つ。
    lastViewedAt: integer("last_viewed_at", { mode: "timestamp_ms" }),
    // このグループ内での表示名（#64）。null（未設定）なら user.name にフォールバックする。
    // グループによって呼ばれたい名前が異なるため、user ではなくメンバーシップ行に持たせる。
    displayName: text("display_name"),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] })],
);

// グループ招待リンク。トークン付き URL でメンバーを集める。
// token は推測困難なランダム文字列を主キーとする。期限内かつ未失効（revokedAt IS NULL）なら有効。
// グループごとに有効リンクは原則 1 本（再発行時に既存の有効トークンを失効させる）。
export const groupInvitation = sqliteTable(
  "group_invitation",
  {
    token: text("token").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => group.id, { onDelete: "cascade" }),
    // 発行者（監査用メタ情報）。発行者がアカウント削除されても、グループに残る他メンバーが
    // 共有中のリンクを生かし続けられるよう、CASCADE ではなく SET NULL とする（nullable）。
    invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    // 無効化時刻。null なら未失効。明示的な無効化・再発行時にこの列を打つ。
    revokedAt: integer("revoked_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  // 有効リンク取得（active）・再発行時の一括失効はいずれも groupId + revokedAt で絞るため、
  // この複合インデックスでグループ単位のフルスキャンを避ける。
  (t) => [index("group_invitation_group_id_revoked_at_idx").on(t.groupId, t.revokedAt)],
);

// 購入品。status は未精算/精算済の 2 状態。kind は支出（割り勘）/収入（分配）の 2 種類
//（収入分配機能）。income では payments=受取額、shares=分担額として役割が反転する。
export const item = sqliteTable(
  "item",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    groupId: text("group_id")
      .notNull()
      .references(() => group.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    purchasedOn: integer("purchased_on", { mode: "timestamp" }),
    memo: text("memo"),
    status: text("status", { enum: ["unsettled", "settled"] })
      .notNull()
      .default("unsettled"),
    kind: text("kind", { enum: ITEM_KINDS }).notNull().default("expense"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  // 一覧取得（GET /items）は groupId + status で絞り createdAt 降順で返すため、
  // 並び替えまでカバーする複合インデックスでテーブルフルスキャン + ソートを避ける。
  // 精算/未精算更新の WHERE（groupId + status + id IN）も前 2 カラムで恩恵を受ける。
  (t) => [index("item_group_id_status_created_at_idx").on(t.groupId, t.status, t.createdAt)],
);

// 各メンバーが実際に支払った額。(itemId, userId) で一意。
export const itemPayment = sqliteTable(
  "item_payment",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.userId] })],
);

// 各メンバーが負担すべき額（割勘金額）。(itemId, userId) で一意。
export const itemShare = sqliteTable(
  "item_share",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.userId] })],
);
