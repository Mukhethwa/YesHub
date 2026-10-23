import { Suspense } from "react";

import { AnalyticsTabs } from "@/components/admin/analytics-tabs";

export default function Page() {
  // The tabs read ?view= so Insights can be linked to, which needs a Suspense boundary
  return (
    <Suspense>
      <AnalyticsTabs scope="organisation" />
    </Suspense>
  );
}
