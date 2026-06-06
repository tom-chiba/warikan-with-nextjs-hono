import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
