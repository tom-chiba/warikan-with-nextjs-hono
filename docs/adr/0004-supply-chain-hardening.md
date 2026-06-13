---
status: accepted
date: 2026-05-30
deciders: tom-chiba
---

# pnpm によるサプライチェーン対策

## Context and Problem Statement

npm エコシステムでは、パッケージの乗っ取りや悪性バージョンの公開（公開直後にインストールさせ、数時間〜数日で削除される手口）、postinstall スクリプトによるコード実行などのサプライチェーン攻撃が継続的に発生している。依存インストール時のリスクを現実的なコストで下げる方針を決める。

## Decision Drivers

- 公開直後の悪性バージョンを踏むリスクを下げたい
- インストール時の任意コード実行（ライフサイクルスクリプト）を無制限に許さない
- 過剰な運用負荷をかけず、既定で守られている部分はそれを活かす

## Considered Options

- **pnpm 11 のセキュア・バイ・デフォルトを活かしつつ、非デフォルトの保護を明示有効化する**
- 追加対策をせず pnpm の既定のみに任せる
- 外部の SCA / ロックファイル監査ツールを主軸に据える

## Decision Outcome

選んだ選択肢: 「**pnpm 11 の既定を活かしつつ、非デフォルトの保護を明示有効化する**」。理由は、pnpm 11 が既にライフサイクルスクリプトの許可制・公開待機などを既定化しており、最小の追記で実効的な防御が得られるため。

`pnpm-workspace.yaml` に記述する設定（**非デフォルトのみ明示**。既定で有効なものは冗長になるため記述しない）:

- `minimumReleaseAge: 4320`（3 日）: 公開後 3 日未満のバージョンはインストールしない。乗っ取り直後の悪性版を回避する。
- `trustPolicy: no-downgrade`: 信頼度が過去の版より低下した場合（provenance / 信頼 publisher の喪失 = アカウント乗っ取りの兆候）にインストールを失敗させる。既定は `off`。
- `allowBuilds`: ビルドスクリプト実行を許可するパッケージを個別承認（既定は許可制）。承認した依存は「なぜ許可したか」をコメントで残す。

既定で有効なため記述しないもの: `strictDepBuilds`（未承認ビルドで install 失敗）、`blockExoticSubdeps`（推移依存の git/tarball 禁止）、`dangerouslyAllowAllBuilds: false`、`verifyStoreIntegrity` 等。

設定ファイル以外の運用:

- `pnpm-lock.yaml` をコミットする。
- CI では `pnpm install --frozen-lockfile` を用いる。
- 既知の脆弱性の検知・更新は Dependabot（security updates / alerts）に任せる（`.github/dependabot.yml`）。当初は `pnpm audit` を CI に組み込んでいたが、検知して落とすだけで更新は手動対応となり CI を不要にブロックしていたため廃止した。Dependabot は検知に加えて更新 PR を自動で立てるため、検知から修正までの時間を短縮できる。

### Consequences

- 良い点: 既定の保護に加え、公開待機とトラスト降格検知という実効的な層を最小の追記で得られる。実際に `@types/node@20` 経由の `undici-types` でトラスト降格を検知できた（誤検知だったが、正しいバージョンへ更新する契機になった）。
- 悪い点 / トレードオフ: `minimumReleaseAge` により最新バージョンの取り込みが最大 3 日遅れる。緊急パッチが必要な場合は `minimumReleaseAgeExclude` で個別に除外する。
- 悪い点 / トレードオフ: ビルドを要する依存の追加時に `allowBuilds` での都度承認が必要になる（意図的なコストとして許容）。
- 運用ルール: `allowBuilds` / `*Exclude` で例外を設けた場合は理由をコメントで残し、監査可能にする。

## More Information

- 設定方針「非デフォルトのみ記述」はリポジトリ共通の方針。
- 参考: pnpm Settings / Mitigating supply chain attacks（pnpm 公式ドキュメント）。
