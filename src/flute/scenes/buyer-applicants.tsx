"use client";

import { EnterpriseShell } from "@/components/enterprise/enterprise-shell";
import { OpportunitiesView } from "@/components/enterprise/opportunities-view";
import { AppFrame } from "../lifted";

// The opportunity comes from the scene URL (&id=…), the same way the real page reads it
export default function BuyerApplicantsScene() {
  return (
    <AppFrame pathname="/dashboard/opportunities" height={1500}>
      <EnterpriseShell>
        <OpportunitiesView />
      </EnterpriseShell>
    </AppFrame>
  );
}
