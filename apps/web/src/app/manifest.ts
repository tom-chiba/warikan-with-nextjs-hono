import type { MetadataRoute } from "next";
import { APP_DESCRIPTION, APP_NAME, THEME_COLORS } from "@/lib/app-meta";

// Web App Manifest(/manifest.webmanifest として配信される)。
// theme_color はライトテーマ基準。ダークテーマのテーマカラーは
// layout.tsx の viewport.themeColor(media query 付き)が優先される。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: APP_DESCRIPTION,
    // ログイン済みユーザーの作業起点であるグループ一覧から起動する。
    start_url: "/groups",
    // scope を省略すると start_url から /groups/ が導出され、
    // / や /invite などがスタンドアロン表示から外れてしまうため明示する。
    scope: "/",
    display: "standalone",
    background_color: THEME_COLORS.light,
    theme_color: THEME_COLORS.light,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
