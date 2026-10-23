"use client";

import { EnterpriseOverview } from "@/components/enterprise/enterprise-overview";
import { EnterpriseShell } from "@/components/enterprise/enterprise-shell";
import { AppFrame } from "../lifted";

export default function BuyerOverviewScene() {
  return (
    <AppFrame pathname="/dashboard">
      <EnterpriseShell>
        <EnterpriseOverview />
      </EnterpriseShell>
    </AppFrame>
  );
}
