// warikan の Service Worker。
// 現時点ではインストール可能(installable)にすることだけが目的で、
// キャッシュは一切持たない。オフライン対応は別 Issue で拡張する。

// install: 待機フェーズをスキップして新しい SW を即座にアクティブにする。
self.addEventListener("install", () => {
  self.skipWaiting();
});

// activate: 既存クライアントを即座にこの SW の制御下に置く。
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// fetch: respondWith() を呼ばないため、すべてのリクエストはブラウザの
// デフォルトの fetch で処理され、SW は介入しない(認証 Cookie 付きの
// 別オリジン API リクエストにも触れない)。
// Chrome 108/112 以降は manifest + HTTPS だけでインストール可能になったが、
// 旧基準のブラウザとの互換と、将来キャッシュ戦略を差し込む場所として置いている。
self.addEventListener("fetch", () => {});
