import { Building2Icon, BriefcaseBusinessIcon, LayoutDashboardIcon, StoreIcon, UserCogIcon } from "lucide-react";

import type { PortalNavItem } from "@/components/portal/types";

export const ADMIN_NAV = {
  overview: { href: "/admin", label: "Overview", icon: LayoutDashboardIcon },
  users: { href: "/admin/users", label: "Users", icon: UserCogIcon },
  smes: { href: "/admin/smes", label: "SMEs", icon: StoreIcon },
  organisations: { href: "/admin/organisations", label: "Organisations", icon: Building2Icon },
  opportunities: { href: "/admin/opportunities", label: "Opportunities", icon: BriefcaseBusinessIcon },
} satisfies Record<string, PortalNavItem>;
