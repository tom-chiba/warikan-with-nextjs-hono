---
status: accepted
date: 2026-06-08
deciders: tom-chiba
---

# React Compiler による自動メモ化の採用

## Context and Problem Statement

再描画最適化のために `useMemo` / `useCallback` / `React.memo` を手書きすると、依存配列の保守コストとレビュー負荷がかかり、漏れや過剰メモ化の温床になる（Issue #35、PR #34 のレビュー経緯）。React Compiler 1.0 が stable となり、Next.js 16 でもトップレベルオプションとして正式サポートされたため、メモ化をコンパイラに委ねるかどうかを決める。

## Decision Drivers

- 手動メモ化の記述・保守コストを減らしたい
- 購入品入力（ルート `/` と `/groups/[groupId]/items/new`）の軽さ・速さを維持したい（バンドル増は許容範囲に収める）
- 本番ビルドとテストでコンパイル挙動が乖離しないこと
- Compiler が前提とする Rules of React 違反を機械的に検出できること

## Considered Options

- **React Compiler を有効化し、手動メモ化は原則書かない**
- 手動メモ化を継続し、Compiler は導入しない
- `compilationMode: "annotation"` で対象コンポーネントを限定して段階導入する

## Decision Outcome

選んだ選択肢: 「**React Compiler を有効化し、手動メモ化は原則書かない**」。理由は、Compiler 1.0 は stable で React 19 が推奨ターゲットであること、事前の `react-compiler-healthcheck` で全 20 コンポーネントが対応済みと確認できたこと、計測したオーバーヘッド（下記）が方針の許容範囲に収まったため。ほぼ全コンポーネントがクライアントコンポーネントである本アプリでは適用範囲も広い。

- `next.config.ts` にトップレベルで `reactCompiler: true` を設定（infer モード。Next.js 16 で stable）。
- Vitest にも `@rolldown/plugin-babel` + `reactCompilerPreset()`（`@vitejs/plugin-react` v6）で同じ変換を適用し、本番とテストの挙動を揃える。
- `babel-plugin-react-compiler` は exact 固定（`next` / `react` と同じ方針）。更新時は changelog を確認し、テスト一式を通してから上げる。exact 固定の対象はコンパイラ本体のみとし、変換経路のパッケージ（`@rolldown/plugin-babel` / `@babel/core`）は `^` で管理する。
- 手動メモ化は原則書かない。既存の `useMemo`（`unsettled-view.tsx` の 3 箇所）は削除した。Effect の依存を安定させる等、参照同一性が API 契約上必要な場合のみエスケープハッチとして許容する。
- Compiler の誤最適化が疑われる場合は、該当コンポーネント先頭の `"use no memo"` ディレクティブで個別にスキップして切り分ける。

#### Lint（ADR-0003 の見直し条項の発動）

Compiler は Rules of React 違反のコンポーネントを静かにスキップするため、違反の検出には lint が必要。Compiler 診断ルールは `eslint-plugin-react-hooks` v7 に統合されており oxlint では代替できないため、ADR-0003「将来、Oxc で表現できない lint 要件が出た場合は本 ADR を見直す」に基づき、**apps/web に閉じた最小構成で ESLint を併用**する。

- `apps/web/eslint.config.mjs`: `eslint-plugin-react-hooks` の flat `recommended`（Compiler 診断を含む）のみ。
- 汎用 lint（typescript / unicorn / correctness）は引き続き oxlint が担当し、責務を重複させない。
- ルートの `pnpm lint` で `oxlint` → `eslint` を連結実行する（CI 変更不要）。

ADR-0003 は「Oxc 一本化」の原則としては引き続き有効（superseded にはしない）。

### Consequences

- 良い点: メモ化の記述・依存配列の保守が不要になり、再描画最適化が全クライアントコンポーネントに自動で効く。
- 良い点: テストも Compiler 変換後のコードで走るため、Compiler 起因の問題をユニットテストで検出できる。
- 悪い点 / トレードオフ: ビルド時間が約 4.1s → 4.8s（ローカル計測）に増加。JS 転送量（gzip）はルート `/` で +2.1KB（217.4 → 219.5KB）、`/groups/[groupId]/items/new` で +0.8KB。いずれも許容と判断。
- 悪い点 / トレードオフ: リンターが oxlint + ESLint の二本体制になる（責務は分離済み）。
- 注意: `@babel/core` の推移依存 `semver@6.3.1` が trustPolicy の誤検知に当たるため、理由付きで `trustPolicyExclude` に追加した（ADR-0004 の運用ルール）。

## More Information

- React Compiler 1.0: https://react.dev/blog/2025/10/07/react-compiler-1
- Next.js `reactCompiler`: https://nextjs.org/docs/app/api-reference/config/next-config-js/reactCompiler
- Issue #35
