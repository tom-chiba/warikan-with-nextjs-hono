"use client";

import { useState } from "react";
import { sendVerificationEmail } from "@/lib/auth-client";

// サインアップ成功後（#69 の仮登録状態）の「確認メールを送信しました」表示と再送導線。
// AuthPanel の外（親ページ）に置く理由: サインアップ成功で Better Auth がセッションを再取得し、
// useSession が一時的に isPending になると親ページが SessionPending を出して AuthPanel を
// アンマウントする。AuthPanel の内部 state でこの表示を持つと再マウントで失われるため、
// セッション解決に左右されない親側でこの通知を保持・描画する。
export function VerificationSentNotice({ email, onBack }: { email: string; onBack: () => void }) {
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  // 確認メールを再送する。列挙対策として成否で表示を変えず、試行後は常に同じ完了文言を出す。
  async function handleResend() {
    setResending(true);
    setResent(false);
    try {
      await sendVerificationEmail({
        email,
        callbackURL: `${window.location.origin}/verify-email`,
      });
    } catch {
      // ネットワーク断等。中立表示を保つため握りつぶす。
    }
    setResent(true);
    setResending(false);
  }

  return (
    <div className="flex w-full max-w-xs flex-col gap-4">
      <p className="note-ok">
        確認メールを送信しました。メール内のリンクをクリックすると登録が完了し、サインインできるようになります。
      </p>
      <p className="note-muted">
        メールが届かない場合は、迷惑メールフォルダをご確認のうえ、下のボタンから再送してください。
      </p>
      {resent && <p className="note-ok">確認メールを再送しました。</p>}
      <button type="button" onClick={handleResend} disabled={resending} className="btn btn-line">
        確認メールを再送
      </button>
      <button type="button" onClick={onBack} className="link-quiet self-start">
        サインインへ戻る
      </button>
    </div>
  );
}
