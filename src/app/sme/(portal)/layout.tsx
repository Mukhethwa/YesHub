import type { Metadata } from "next";

import { SmePortalShell } from "@/components/sme-portal/sme-portal-shell";

export const metadata: Metadata = {
  title: "SME portal | MASLink",
};

export default function SmePortalLayout({ children }: LayoutProps<"/sme">) {
  return <SmePortalShell>{children}</SmePortalShell>;
}
