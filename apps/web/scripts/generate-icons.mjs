// PWA 用アイコン(PNG)を SVG から生成するスクリプト。
// デザインを変える場合は buildSvg() を編集し、生成された PNG も一緒にコミットすること。
// 実行: pnpm --filter @warikan/web generate-icons
// 前提: ルートの @playwright/test を利用するため、Chromium 未取得なら
//       `pnpm exec playwright install chromium` を先に実行する。
import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");

// 割り勘を表す「2 つに割れてずれたコイン」のグリフ。
// maskable はセーフゾーン(中心の直径 80% の円)に収まるよう控えめに、
// 通常アイコンは少し大きめに描く。
const buildSvg = (size, glyphScale) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#10b981"/>
  <g transform="rotate(-30 256 256)">
    <g transform="translate(256 256) scale(${glyphScale}) translate(-256 -256)">
      <path d="M 106 256 A 150 150 0 0 1 406 256 Z" fill="#ffffff" transform="translate(22 -18)"/>
      <path d="M 406 256 A 150 150 0 0 1 106 256 Z" fill="#ffffff" transform="translate(-22 18)"/>
    </g>
  </g>
</svg>`;

const targets = [
  { file: "icon-192.png", size: 192, glyphScale: 1.2 },
  { file: "icon-512.png", size: 512, glyphScale: 1.2 },
  { file: "icon-512-maskable.png", size: 512, glyphScale: 1 },
  { file: "apple-touch-icon.png", size: 180, glyphScale: 1.2 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, size, glyphScale } of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>*{margin:0}svg{display:block}</style>${buildSvg(size, glyphScale)}`,
  );
  await page.screenshot({ path: path.join(publicDir, file) });
  console.log(`generated ${file}`);
}
await browser.close();
