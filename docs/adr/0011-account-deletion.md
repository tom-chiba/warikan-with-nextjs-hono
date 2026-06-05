---
status: accepted
date: 2026-06-06
deciders: tom-chiba
---

# アカウント削除（退会）と孤児グループの掃除

## Context and Problem Statement

アカウント削除機能（[#33](https://github.com/tom-chiba/warikan-with-nextjs-hono/issues/33)）では、Better Auth の `deleteUser` をパスワード再入力方式で有効化する。user 行の削除で `group_member` は CASCADE で消えるが、グループ本体は消えないため、「唯一メンバーだったグループ」がメンバー 0 人のまま残る。これをメンバー削除 API の「最後の 1 人が抜けたらグループも消す」（[ADR-0009](./0009-group-authorization-layer.md) の系譜）と整合する形で掃除する必要がある。

user 削除は Better Auth の内部アダプタ経由で行われるため、グループ掃除を user 削除と同一の D1 トランザクション（`db.batch()`）に収めることはできない。掃除をどのタイミングで行うかが論点となる。

## Decision Drivers

- user 削除とグループ掃除が別トランザクションになる制約下で、障害時の不整合が安全な方向に倒れること
- 既存の「最後の 1 人が抜けたらグループも消す」と利用者から見た挙動が揃うこと
- 既存パターン（`notExists`、ADR-0010 の「一覧は `group_member` 起点」）との整合

## Considered Options

- **`beforeDelete`（対象特定型）**: user 削除前に「このユーザーが唯一メンバーのグループ」を相関サブクエリで特定して削除する
- **`afterDelete`（全件掃除型）**: user 削除後に「メンバー 0 人のグループ」を `NOT EXISTS` で全件削除する
- カスタムルートでの自前実装（パスワード検証・セッション無効化を自作する必要があり除外）

## Decision Outcome

選んだ選択肢: 「`afterDelete`（全件掃除型）」。理由は障害時の不整合の方向が安全なため。

- `beforeDelete` の障害（グループ削除成功 → user 削除失敗）は「アカウントが残ったのにグループと精算データだけ消えた」というデータ消失方向の不整合になる。
- `afterDelete` の障害は「メンバー 0 人のグループが残る」だけで、一覧は `group_member` 起点（ADR-0010）のため UI に露出せず、掃除クエリは冪等なので次回の退会時に自動回収される（自己修復）。
- グループ作成は `group` + `group_member` を `db.batch()` で原子的に挿入する（ADR-0010）ため、「作成直後でメンバー未登録のグループ」を全件掃除が誤削除する競合は発生しない。
- `afterDelete` 内は try/catch で握り、掃除の失敗で退会リクエスト自体を 500 にしない（user 削除は成功済みのため）。

### Consequences

- 良い点: 障害時も利用者に実害が出ない。掃除は冪等・自己修復的で、`notExists` の既存パターンを型安全な Drizzle のまま再利用できる。
- 悪い点 / トレードオフ: 掃除のたびに全グループを走査する（現状の規模では無視できる。問題になったら対象特定型への再設計を検討する）。掃除失敗時はゴミ行が次の退会まで残る。
- 仕様として認識済み: 他メンバーが残るグループでも、退会者の支払・負担記録（`item_payment` / `item_share`）は user.id への CASCADE で消える（メンバー退出時とは挙動が異なる。#33 の留意点）。

## More Information

- 実装は `apps/api/src/auth.ts`（`user.deleteUser.afterDelete`）、テストは `apps/api/test/routes/delete-user.test.ts` を参照。
- Web 側は `/settings`（`apps/web/src/app/settings/page.tsx`）からパスワード再入力 + confirm で `authClient.deleteUser` を呼ぶ。
- 関連: [ADR-0007](./0007-auth-better-auth.md)（Better Auth 採用）, [ADR-0009](./0009-group-authorization-layer.md)（グループ認可レイヤ）, [ADR-0010](./0010-db-injection-and-collection-routes.md)（batch と一覧取得の方針）。
- 参考: [Better Auth: Delete User](https://better-auth.com/docs/concepts/users-accounts#delete-user)
