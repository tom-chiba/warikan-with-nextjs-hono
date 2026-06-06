"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/register-sw";

// Service Worker をマウント時に登録する、描画を持たない副作用コンポーネント。
// layout.tsx はサーバーコンポーネントのため、クライアント側の登録処理をここに切り出す。
export function SwRegister() {
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return null;
}
