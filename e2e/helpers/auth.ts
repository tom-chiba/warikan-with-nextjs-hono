import { expect, type Page } from "@playwright/test";

// API のオリジン。playwright.config の baseURL は web(:3000) を指すため、受信箱エンドポイント
// /__test__/* を叩くには api(:8787) を直接指定する必要がある（password-reset.spec.ts と同じ）。
export const API_ORIGIN = "http://localhost:8787";

export interface SentEmail {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

// 受信箱から指定宛先の最新メール本文を取り出し、linkPattern に一致するリンク URL を返す。
// メールは #70 のインメモリ受信箱（EMAIL_TEST_INBOX=1）に記録される。宛先は実行ごとに一意のため、
// 受信箱をクリアしなくても他テストのメールと混ざらない。
// sendOnSignUp 等の送信は runInBackgroundOrAwait でレスポンス後に走りうるため、画面表示直後は
// まだ記録されていないことがある。expect.poll で記録されるまで待ってから取り出す。
async function fetchEmailLink(page: Page, to: string, linkPattern: RegExp): Promise<string> {
  let url = "";
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`${API_ORIGIN}/__test__/emails`);
        if (!res.ok()) {
          return "";
        }
        const { emails } = (await res.json()) as { emails: SentEmail[] };
        const mail = emails.findLast((e) => e.to === to);
        const body = mail?.text ?? mail?.html ?? "";
        url = body.match(linkPattern)?.[0] ?? "";
        return url;
      },
      { message: `${to} 宛のメールにリンクが見つからない`, timeout: 15_000 },
    )
    .not.toBe("");
  return url;
}

// サインアップ時の確認リンク URL（API の /api/auth/verify-email?...）を取り出す。
export function fetchVerificationUrl(page: Page, to: string): Promise<string> {
  return fetchEmailLink(page, to, /https?:\/\/[^\s"]+\/api\/auth\/verify-email\?[^\s"]+/);
}

// パスワード再設定（#68）のリンク URL を取り出す。再設定リンクはパスが固定でない
//（API がトークン検証後にリダイレクトする）ため、最初の URL を取れば十分。
export function fetchResetUrl(page: Page, to: string): Promise<string> {
  return fetchEmailLink(page, to, /https?:\/\/[^\s"]+/);
}

// 現在開いているページ（トップ / 招待ページ等）のサインアップフォームを送信する。
// #69 によりサインアップは仮登録となり、成功すると「確認メールを送信しました」表示に切り替わる。
export async function submitSignUp(
  page: Page,
  { name, email, password = "password1234" }: { name: string; email: string; password?: string },
) {
  await page.getByRole("tab", { name: "サインアップ" }).click();
  await page.getByLabel("名前").fill(name);
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "サインアップ" }).click();
  await expect(page.getByText(/確認メールを送信しました/)).toBeVisible({ timeout: 30_000 });
}

// 受信箱の確認リンクを踏んで検証を完了する。autoSignInAfterVerification によりサインイン状態になり、
// /verify-email の完了表示に着地する。
export async function completeVerification(page: Page, email: string) {
  const url = await fetchVerificationUrl(page, email);
  await page.goto(url);
  await expect(page.getByText(/メールアドレスの確認が完了しました/)).toBeVisible({
    timeout: 30_000,
  });
}

// トップから一意メールでサインアップし、確認リンクまで踏んでログイン状態にする共通操作。
// ログイン状態（常設ナビのグループ作成導線）まで確認して返す。
export async function signUpAndVerify(
  page: Page,
  { name, email, password = "password1234" }: { name: string; email: string; password?: string },
) {
  await page.goto("/");
  await submitSignUp(page, { name, email, password });
  await completeVerification(page, email);
  await page.getByRole("link", { name: "アプリへ" }).click();
  await expect(page.getByRole("link", { name: "グループを作成" })).toBeVisible({
    timeout: 30_000,
  });
}
