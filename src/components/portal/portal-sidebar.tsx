"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { UserButton } from "@/components/auth/user/user-button";
import { useScenePathname } from "@/components/scene-parts";
import { Logo, LogoMark } from "@/components/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { PortalNavItem } from "./types";

/** The nav item a path belongs to: an exact match, or the longest one it's under (e.g. /admin/users?id=…). */
export function activeNavItem(nav: PortalNavItem[], pathname: string) {
  return nav
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/** Collapses to icons on desktop (the header button, the rail or Ctrl/⌘+B); a sheet on phones. */
export function PortalSidebar({ label, homeHref, nav }: { label: string; homeHref: string; nav: PortalNavItem[] }) {
  const realPathname = usePathname();
  const pathname = useScenePathname() ?? realPathname;
  const { setOpenMobile, state, isMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const active = activeNavItem(nav, pathname);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 justify-center overflow-hidden border-b border-sidebar-border px-4 group-data-[collapsible=icon]:px-1">
        <Link
          href={homeHref}
          onClick={() => setOpenMobile(false)}
          aria-label={`${label} home`}
          className="flex items-center text-white group-data-[collapsible=icon]:justify-center"
        >
          {/* The mark is wide and short, so size it by width to fit the 3rem rail */}
          {collapsed ? <LogoMark className="h-auto w-9" /> : <Logo />}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/60">{label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map(({ href, label: itemLabel, icon: Icon, badge, badgeLabel }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    asChild
                    isActive={active?.href === href}
                    tooltip={itemLabel}
                    className="data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground data-[active=true]:hover:bg-sidebar-primary"
                  >
                    <Link href={href} onClick={() => setOpenMobile(false)}>
                      <Icon />
                      <span>{itemLabel}</span>
                    </Link>
                  </SidebarMenuButton>
                  {badge && <SidebarMenuBadge aria-label={badgeLabel}>{badge}</SidebarMenuBadge>}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <UserButton
          size={collapsed ? "icon" : "default"}
          variant="ghost"
          align={collapsed ? "start" : "center"}
          className={cn(
            "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&_.text-foreground]:text-white [&_.text-muted-foreground]:text-sidebar-foreground/70",
            collapsed ? "mx-auto" : "w-full justify-start",
          )}
        />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
