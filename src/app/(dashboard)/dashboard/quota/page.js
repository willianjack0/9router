import { Suspense } from "react";
import { CardSkeleton } from "@/shared/components/Loading";
import QuotaMonitorView from "@/components/quota-monitor/QuotaMonitorView";

export default function QuotaPage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <QuotaMonitorView />
    </Suspense>
  );
}
