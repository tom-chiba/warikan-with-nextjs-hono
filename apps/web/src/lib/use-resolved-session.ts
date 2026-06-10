import { useState } from "react";
import { useSession } from "@/lib/auth-client";

// useSession（better-auth）のラッパー。未ログイン時のフォーカス再取得でフォーム入力値が消える
// 問題への対処（#76）。
//
// better-auth の useSession は既定で refetchOnWindowFocus: true のため、タブがアクティブになる
// （visibilitychange → visible）たびにセッションを再取得する。このとき dist の useAuthQuery は
// `isPending: currentValue.data === null` としており、未ログイン（data が null）の場合は再取得の
// たびに isPending が true に戻る。各ページの `if (isPending) <SessionPending />` ガードはこれで
// 子（AuthPanel 等）をアンマウントするため、入力途中のフォーム値が破棄される。
//
// 一度でもセッションが解決したら（isPending が初めて false になったら）、以降の再取得中は保留扱いに
// 戻さない。直前の表示（AuthPanel やログイン後 UI）を維持し、フォーカスごとに一瞬ローディング画面へ
// 切り替わる挙動も併せて解消する。data は better-auth が再取得中も直前値を保持するためそのまま渡せる。
//
// refetchOnWindowFocus: false にする案もあるが、別タブでのサインイン/サインアウトの反映が遅れる
// 副作用があるため、表示側（このフック）で吸収する。
//
// ラッチが抑えるのは isPending（＝ローディング画面の表示）だけで、data は常に最新値を透過する。
// このため再取得中に古いセッションが表示されることはない。ラッチはコンポーネントのマウント単位で、
// ページ遷移（router.push による再マウント）でリセットされる。
export function useResolvedSession() {
  const result = useSession();
  // 一度解決したら戻さないためのフラグ。解決した最初の render では isPending を直接見て false を
  // 返すため取りこぼさず、以降の再取得（isPending が true に戻る）はこのフラグで保留扱いを抑える。
  const [resolvedOnce, setResolvedOnce] = useState(false);
  // render 中の条件付き setState で一度だけラッチする（React 公式推奨の「派生 state を覚える」
  // パターン）。effect 経由のカスケード再描画を避けつつ、解決した最初の render から反映できる。
  if (!result.isPending && !resolvedOnce) {
    setResolvedOnce(true);
  }
  return {
    ...result,
    isPending: result.isPending && !resolvedOnce,
  };
}
