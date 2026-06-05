// テスト専用のパスワードハッシャー(本番使用禁止)。
//
// Better Auth デフォルトの scrypt は Miniflare(workerd)上で 1 回あたり数百 ms かかり、
// テスト全体で signUpAndGetCookie() が約 90 回呼ばれるため支配的なボトルネックになる(#42)。
// テスト時のみ SHA-256 に差し替えて scrypt のコストを排除する。
//
// SHA-256 はソルトなし・高速計算可能でパスワードハッシュとして安全ではないため、
// 呼び出し元(auth.ts)が TEST_HASH フラグでテスト環境に限定することを前提とする。
// "test:" プレフィックスにより、万一このハッシュが本番 DB に混入しても
// 本番の scrypt verify は解釈できず必ずログイン失敗になる(フェイルセーフ)。

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Better Auth の emailAndPassword.password が要求する { hash, verify } インターフェース。
export const testPasswordHasher = {
  async hash(password: string): Promise<string> {
    return `test:${await sha256Hex(password)}`;
  },
  async verify({ hash, password }: { hash: string; password: string }): Promise<boolean> {
    return hash === (await this.hash(password));
  },
};
