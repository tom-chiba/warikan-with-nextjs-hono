// 推測困難な招待トークンを生成する。32 バイトの乱数を base64url（URL に安全な文字）で表現する。
// crypto / btoa は Workers ランタイムのグローバルとして利用でき、Workers 固有型に依存しないため
// rpc.ts グラフ（ルートハンドラ）から安全に import できる。
export function generateInvitationToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
