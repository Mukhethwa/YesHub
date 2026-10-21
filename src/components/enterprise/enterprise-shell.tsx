"use client";

import type { ReactNode } from "react";

import { PortalShell } from "@/components/portal/portal-shell";
import { ENTERPRISE_NAV } from "./nav";

export function EnterpriseShell({ children }: { children: ReactNode }) {
  return (
    <PortalShell
      area="enterprise"
      label="Enterprise"
      homeHref="/dashboard"
      nav={Object.values(ENTERPRISE_NAV)}
      searchPlaceholder="Search suppliers"
    >
      {children}
    </PortalShell>
  );
}
