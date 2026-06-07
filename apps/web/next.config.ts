import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // React Compiler による自動メモ化を有効化する（ADR-0014）。手動の
  // useMemo / useCallback / React.memo は原則不要になる。誤最適化の疑いがある
  // コンポーネントは先頭に "use no memo" を書くと個別にスキップできる。
  reactCompiler: true,
  // @warikan/domain は TypeScript ソースをそのまま公開するワークスペースパッケージのため、
  // Next.js 側でトランスパイルして取り込む（ADR-0013）。
  transpilePackages: ["@warikan/domain"],
  async headers() {
    return [
      {
        // Service Worker が HTTP キャッシュに残ると更新が反映されないため無効化する。
        // クライアント側の updateViaCache: "none"(register-sw.ts)と合わせた二重の防御。
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
