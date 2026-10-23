import {
  BriefcaseBusinessIcon,
  Building2Icon,
  FileTextIcon,
  HandHeartIcon,
  HandshakeIcon,
  LayoutDashboardIcon,
  SettingsIcon,
} from "lucide-react";

import type { PortalNavItem } from "@/components/portal/types";

export const SME_NAV = {
  overview: { href: "/sme", label: "Overview", icon: LayoutDashboardIcon },
  opportunities: { href: "/sme/opportunities", label: "Opportunities", icon: BriefcaseBusinessIcon },
  matches: { href: "/sme/matches", label: "My matches", icon: HandshakeIcon },
  programmes: { href: "/sme/programmes", label: "Support programmes", icon: HandHeartIcon },
  documents: { href: "/sme/documents", label: "Documents", icon: FileTextIcon },
  profile: { href: "/sme/profile", label: "Business profile", icon: Building2Icon },
  settings: { href: "/sme/settings", label: "Settings", icon: SettingsIcon },
} satisfies Record<string, PortalNavItem>;
