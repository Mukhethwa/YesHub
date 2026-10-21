"use client";

import type { ReactNode } from "react";

import { PortalShell } from "@/components/portal/portal-shell";
import { useCurrentSme } from "@/hooks/use-current-sme";
import { documentProgress } from "@/lib/sme/documents";
import { SME_NAV } from "./nav";

export function SmePortalShell({ children }: { children: ReactNode }) {
  const sme = useCurrentSme();
  const docPercent = sme ? documentProgress(sme).percent : null;

  const nav = Object.values(SME_NAV).map((item) =>
    item === SME_NAV.documents && docPercent !== null
      ? { ...item, badge: `${docPercent}%`, badgeLabel: `${docPercent}% of documents uploaded` }
      : item,
  );

  return (
    <PortalShell area="sme" label="SME portal" homeHref="/sme" nav={nav} searchPlaceholder="Search opportunities">
      {children}
    </PortalShell>
  );
}
