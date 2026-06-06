// アプリ名・説明・テーマ色の単一の定義元。
// manifest(インストールダイアログ)・layout の metadata(タブタイトル等)・
// ページ見出しで共有し、改名や配色変更時の更新漏れを防ぐ。
export const APP_NAME = "warikan";
export const APP_DESCRIPTION = "割り勘アプリ";

// 背景色。globals.css の --background(CSS 側は import できないため手動で同期)と揃える。
export const THEME_COLORS = {
  light: "#ffffff",
  dark: "#0a0a0a",
} as const;
