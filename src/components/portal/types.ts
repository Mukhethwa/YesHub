import type { LucideIcon } from "lucide-react";

/** Which of MASLink's three signed-in areas a page belongs to. */
export type PortalArea = "sme" | "enterprise" | "admin";

export interface PortalNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Short trailing text in the sidebar, e.g. "75%". */
  badge?: string;
  /** Screen-reader text for the badge. */
  badgeLabel?: string;
}
