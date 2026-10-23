import { Suspense } from "react";

import { AuditView } from "@/components/enterprise/audit-view";

export default function Page() {
  // AuditView reads ?opportunity= to show one opportunity's entries, which needs a Suspense boundary
  return (
    <Suspense>
      <AuditView />
    </Suspense>
  );
}
