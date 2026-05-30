---
status: accepted
date: 2026-05-30
deciders: tom-chiba
---

# mise による開発ツールのバージョン管理（Node 24 LTS + pnpm）

## Context and Problem Statement

複数人・複数環境（ローカル、CI、デプロイ先）で同じ Node.js / パッケージマネージャのバージョンを再現したい。バージョン差異による「自分の環境だけ動く / 動かない」を避けるため、ツールのバージョンを宣言的に固定する仕組みを決める。

## Decision Drivers

- ローカルと CI で同一バージョンを確実に再現できること
- Node 以外のツール（将来的に追加されうる CLI 等）も同じ仕組みで管理できると望ましい
- パッケージマネージャはモノレポのワークスペース機能とサプライチェーン対策が成熟していること（[ADR-0004](./0004-supply-chain-hardening.md)）

## Considered Options

- **mise + pnpm**（`mise.toml` で Node と pnpm を固定）
- **Volta + pnpm**
- **nvm / corepack のみ**（`.nvmrc` + `packageManager` フィールド）

## Decision Outcome

選んだ選択肢: 「**mise + pnpm**」。理由は、Node に限らず多様なツールを単一の `mise.toml` で宣言的に固定でき、`mise install` 一発で環境を揃えられるため。バージョンは以下に固定する。

- **Node.js `24.16.0`**: Active LTS の最新。Vercel / Cloudflare Workers いずれとも相性が良く安定。最新の Current 系（26 系）はツール側対応が追随しきっていない可能性があるため採用しない。
- **pnpm `11.5.0`**: 最新。ワークスペースとサプライチェーン対策（`minimumReleaseAge` 等）が成熟している。

`package.json` の `packageManager` フィールドにも `pnpm@11.5.0` を記載し、Corepack や Vercel など mise 非経由の環境でも同じ pnpm が使われるようにする。

### Consequences

- 良い点: `mise install` で Node と pnpm が一度に揃い、環境差異を排除できる。
- 良い点: 将来ツールが増えても `mise.toml` に追記するだけで一元管理できる。
- 悪い点 / トレードオフ: 各自が mise を導入している前提になる。未導入者向けに `packageManager` フィールドと `engines.node` で最低限のガードはするが、mise 利用を README 等で案内する必要がある。

## More Information

- Node は LTS 追従とする。次期 LTS への移行時に本 ADR を見直す。
