import { Suspense } from "react";
import { SessionPending } from "@/components/session-states";
import { ItemsPageInner } from "./items-page-inner";

// useSearchParams() を使う Client Component は Suspense 境界が必要（App Router の要件）。
// page.tsx は Server Component の薄いシェルに留め、実体は items-page-inner.tsx に置く。
export default function ItemsPage() {
  return (
    <Suspense fallback={<SessionPending />}>
      <ItemsPageInner />
    </Suspense>
  );
}
