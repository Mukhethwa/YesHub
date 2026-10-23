"use client";

import SmeHome from "@/app/sme/(portal)/page";
import { SmePortalShell } from "@/components/sme-portal/sme-portal-shell";
import { AppFrame } from "../lifted";

export default function SmePortalScene() {
  return (
    <AppFrame pathname="/sme">
      <SmePortalShell>
        <SmeHome />
      </SmePortalShell>
    </AppFrame>
  );
}
