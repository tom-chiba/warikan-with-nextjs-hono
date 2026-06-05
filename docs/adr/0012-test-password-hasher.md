---
status: accepted
date: 2026-06-06
deciders: tom-chiba
---

# テスト専用パスワードハッシャーによる api テストの高速化

## Context and Problem Statement

api のテスト（[ADR-0008](./0008-testing-strategy.md)）は実 workerd 上で Better Auth を実体検証するため、テストヘルパー `signUpAndGetCookie()` が全体で約 90 回サインアップ API を呼ぶ。Better Auth デフォルトのパスワードハッシュ（scrypt）は Miniflare(workerd) 上で 1 回あたり数百 ms〜数秒かかり、70 テストで実時間 40 秒超・`testTimeout: 30_000` への引き上げが必要という状態になっていた（#42）。テストを追加するたびに悪化するため、scrypt のコストをテストから排除する方法を決める。

## Decision Drivers

- テストの実時間を大幅に短縮できること（目安: 半分以下）
- 本番のハッシュ強度（scrypt）には一切影響しないこと。誤って本番で軽量ハッシュが有効になる構造を作らない
- テストコード・ヘルパー（`signUpAndGetCookie` の API）を変えずに済むこと
- Better Auth の内部実装（Cookie 署名形式等）への依存を増やさないこと

## Considered Options

- **A. テスト時のみ `emailAndPassword.password.hash/verify` を SHA-256 に差し替える**（env フラグで分岐）
- B. サインアップ API を経由せず、user/account/session を D1 に直接シードするヘルパーに置き換える
- C. テストファイル間の並列実行（旧 `singleWorker: false` 相当）で実時間を圧縮する

## Decision Outcome

選んだ選択肢: 「**A. テスト時のみ SHA-256 に差し替える**」。理由は、変更が最小（テストコード無変更）で効果が支配的因子（scrypt）に直接効くため。実測で 70 テストの実時間が 40.26s → 6.68s（tests 90.89s → 1.55s）になり、`testTimeout` の引き上げも不要になった。

実装の構造:

- `src/internal/test-password-hasher.ts` に SHA-256 ハッシャーを分離する。ハッシュ値は `test:` プレフィックス付きで、本番の scrypt verify とは互換性がない。万一テストデータが本番 DB に混入しても必ずログイン失敗になるフェイルセーフ
- `createAuth(env)` は `env.TEST_HASH` が truthy のときのみ `password` を差し替える。`TEST_HASH` は `apps/api/vitest.config.ts` の `miniflare.bindings` でのみ注入し、本番 `wrangler.jsonc` の vars / `wrangler secret` には追加しない（キーが存在しない = 常に scrypt）

不採用の理由:

- **B（D1 直接シード）**: Better Auth のセッション Cookie は `BETTER_AUTH_SECRET` による HMAC 署名付きで、偽造には内部実装への依存が必要になりバージョンアップで壊れやすい。A で scrypt が消えれば `signUpAndGetCookie` は数 ms になり、置き換える動機自体が消える
- **C（並列化）**: `@cloudflare/vitest-pool-workers` v0.16 の `WorkersPoolOptionsSchema` には `singleWorker` / `isolatedStorage` が存在せず、従来設定していた `singleWorker: true` も無視されていた（常に 1 Miniflare・D1 共有・ファイル逐次実行）。並列化のつまみが無く、A のみで目標を大幅に達成したため見送る

### Consequences

- 良い点: 実時間 40.26s → 6.68s（約 1/6）。scrypt 由来の `testTimeout: 30_000` を削除しデフォルト（5s）に復帰
- 良い点: テストコード・ヘルパーは無変更。サインイン・退会（パスワード再入力）の verify 経路も実体のまま検証できる
- 悪い点 / トレードオフ: テスト専用コード（`test-password-hasher.ts`）が本番コードツリー（`src/`）に存在する。`src/internal/` に隔離しファイル名と冒頭コメントで本番使用禁止を明示する
- 悪い点 / トレードオフ: テストは本番と異なるハッシュアルゴリズムで動くため、「scrypt 自体の挙動」（ハッシュ強度・所要時間）はテスト対象外になる。ハッシュの差し替えは Better Auth の公開オプションであり、認証フロー（hash → 保存 → verify）の検証は維持される

## More Information

- 関連: [ADR-0007](./0007-auth-better-auth.md)（Better Auth 採用。`emailAndPassword.password` は Better Auth の公開オプション）, [ADR-0008](./0008-testing-strategy.md)（テスト戦略。vitest-pool-workers で実 workerd + D1 を使う方針）
- `TEST_HASH` を本番に追加しないことが安全性の前提。`wrangler.jsonc` / `wrangler secret` に追加してはならない
- 将来 vitest-pool-workers にファイル間並列化・ストレージ分離のオプションが戻った場合、共有 D1 前提のテスト設計（メールアドレスの一意化でデータ干渉を回避）を見直したうえで C を再検討してよい
