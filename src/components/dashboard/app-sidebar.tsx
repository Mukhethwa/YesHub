"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useCurrentSme } from "@/hooks/use-current-sme";
import { documentProgress } from "@/lib/sme/documents";
import { DASHBOARD_NAV } from "./nav";

export function AppSidebar() {
  const pathname = usePathname();
  const sme = useCurrentSme();
  const { setOpenMobile } = useSidebar();
  const docPercent = sme ? documentProgress(sme).percent : null;

  return (
    <Sidebar>
      <SidebarHeader className="h-14 justify-center px-4">
        <Link href="/dashboard" onClick={() => setOpenMobile(false)}>
          <Logo />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {DASHBOARD_NAV.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton asChild isActive={pathname === href}>
                    <Link href={href} onClick={() => setOpenMobile(false)}>
                      <Icon />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                  {href === "/dashboard/documents" && docPercent !== null && (
                    <SidebarMenuBadge aria-label={`${docPercent}% of documents uploaded`}>
                      {docPercent}%
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
