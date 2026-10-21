import {
  BriefcaseBusinessIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  SearchCheckIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";

import type { PortalNavItem } from "@/components/portal/types";

export const ENTERPRISE_NAV = {
  overview: { href: "/dashboard", label: "Overview", icon: LayoutDashboardIcon },
  opportunities: { href: "/dashboard/opportunities", label: "Opportunities", icon: BriefcaseBusinessIcon },
  suppliers: { href: "/dashboard/suppliers", label: "Find suppliers", icon: SearchCheckIcon },
  shortlists: { href: "/dashboard/shortlists", label: "Shortlists", icon: ListChecksIcon },
  team: { href: "/dashboard/team", label: "Team", icon: UsersIcon },
  settings: { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon },
} satisfies Record<string, PortalNavItem>;
