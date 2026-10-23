"use client";

import type { ReactNode } from "react";

import { PortalShell } from "@/components/portal/portal-shell";
import { ADMIN_NAV } from "./nav";

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <PortalShell area="admin" label="MASLink admin" homeHref="/admin" nav={Object.values(ADMIN_NAV)}>
      {children}
    </PortalShell>
  );
}
