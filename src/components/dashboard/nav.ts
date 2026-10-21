import {
  BriefcaseBusinessIcon,
  Building2Icon,
  FileTextIcon,
  HandshakeIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  SettingsIcon,
} from "lucide-react";

export interface DashboardSection {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const DASHBOARD_NAV: DashboardSection[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboardIcon },
  { href: "/dashboard/opportunities", label: "Opportunities", icon: BriefcaseBusinessIcon },
  { href: "/dashboard/matches", label: "My matches", icon: HandshakeIcon },
  { href: "/dashboard/documents", label: "Documents", icon: FileTextIcon },
  { href: "/dashboard/profile", label: "Business profile", icon: Building2Icon },
  { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon },
];
