---
status: accepted
date: 2026-05-30
deciders: tom-chiba
---

# Lint / Format に Oxc を採用

## Context and Problem Statement

モノレポ全体（FE / BE / 設定ファイル）に対する Lint と Format の仕組みを決める。実行速度、設定の単純さ、ツール間の責務重複の少なさを重視する。

## Decision Drivers

- 大きくなりがちなモノレポでも高速に lint / format できること
- 設定がシンプルで、ツールの責務が明確に分かれていること
- FE/BE/設定ファイルを横断して一貫した規約を適用できること

## Considered Options

- **Oxc（`oxlint` + `oxfmt`）**
- **ESLint + Prettier**
- **Biome**

## Decision Outcome

選んだ選択肢: 「**Oxc（`oxlint` + `oxfmt`）**」。理由は、Rust 製で高速、設定が最小限で済み、Linter（`oxlint`）と Formatter（`oxfmt`）が明確に分離されているため。ルートの `package.json` に横断スクリプトを置き、モノレポ全体に 1 コマンドで適用する。

- `oxlint`: `typescript` / `unicorn` / `oxc` プラグイン、`correctness` カテゴリを error とした既定構成（`.oxlintrc.json`）。
- `oxfmt`: 既定設定（`.oxfmtrc.json`）。`.gitignore` を自動で尊重し、JSON / YAML も整形対象。
- Next.js（`apps/web`）では `create-next-app` の ESLint は導入せず、Lint/Format は Oxc に一本化する。

### Consequences

- 良い点: lint / format ともに高速で、CI でも安価。
- 良い点: ESLint + Prettier のような責務重複・相互調整（eslint-config-prettier 等）が不要。
- 悪い点 / トレードオフ: ルールのカバレッジや一部エコシステム（特定の ESLint プラグイン相当）は ESLint より発展途上。必要なルールが不足した場合は個別に補う、または再検討する。
- 注意: ソースファイルが 1 つも無い段階では `oxlint` が「対象なし」でエラー終了する。実コードが入れば解消する。

## More Information

- 将来、Oxc で表現できない lint 要件が出た場合は本 ADR を見直す。
