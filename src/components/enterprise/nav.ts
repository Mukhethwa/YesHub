import {
  BriefcaseBusinessIcon,
  ChartColumnIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  SearchCheckIcon,
  ScrollTextIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";

import type { PortalNavItem } from "@/components/portal/types";

export const ENTERPRISE_NAV = {
  overview: { href: "/dashboard", label: "Overview", icon: LayoutDashboardIcon },
  opportunities: { href: "/dashboard/opportunities", label: "Listings", icon: BriefcaseBusinessIcon },
  suppliers: { href: "/dashboard/suppliers", label: "Find suppliers", icon: SearchCheckIcon },
  shortlists: { href: "/dashboard/shortlists", label: "Shortlists", icon: ListChecksIcon },
  analytics: { href: "/dashboard/analytics", label: "Analytics", icon: ChartColumnIcon },
  team: { href: "/dashboard/team", label: "Team", icon: UsersIcon },
  audit: { href: "/dashboard/audit", label: "Audit log", icon: ScrollTextIcon },
  settings: { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon },
} satisfies Record<string, PortalNavItem>;
