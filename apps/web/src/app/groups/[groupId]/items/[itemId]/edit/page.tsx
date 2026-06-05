import { Suspense } from "react";
import { SessionPending } from "@/components/session-states";
import { EditItemInner } from "./edit-item-inner";

// useSearchParams() を使う Client Component は Suspense 境界が必要（App Router の要件）。
// page.tsx は Server Component の薄いシェルに留め、実体は edit-item-inner.tsx に置く。
export default function EditItemPage() {
  return (
    <Suspense fallback={<SessionPending />}>
      <EditItemInner />
    </Suspense>
  );
}
