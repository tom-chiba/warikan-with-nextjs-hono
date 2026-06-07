import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";
import { SwRegister } from "@/components/sw-register";
import { APP_DESCRIPTION, APP_NAME, THEME_COLORS } from "@/lib/app-meta";
import { Providers } from "./providers";

// 英字・数字用のディスプレイフォント（エディトリアル・シャープ, Issue #38）。
// latin サブセットのみ読み込み、日本語は globals.css のシステムフォントスタックに任せる。
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
  // iOS でホーム画面に追加したときにアプリとして全画面起動させる。
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_NAME,
  },
  icons: {
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

// ブラウザ UI のテーマカラー。
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${archivo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
        <SwRegister />
      </body>
    </html>
  );
}
