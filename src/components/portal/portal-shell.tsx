"use client";

import { useAuthenticate } from "@better-auth-ui/react";
import { SearchIcon } from "lucide-react";
import type { ReactNode } from "react";

import { UserButton } from "@/components/auth/user/user-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { PortalGuard } from "./portal-guard";
import { PortalSidebar } from "./portal-sidebar";
import type { PortalArea, PortalNavItem } from "./types";

/** Sidebar + header layout shared by the SME portal, the enterprise dashboard and the admin area. */
export function PortalShell({
  area,
  label,
  homeHref,
  nav,
  searchPlaceholder,
  children,
}: {
  area: PortalArea;
  label: string;
  homeHref: string;
  nav: PortalNavItem[];
  searchPlaceholder?: string;
  children: ReactNode;
}) {
  // Redirects to sign-in when there's no session (and if it ends while the page is open)
  useAuthenticate(authClient);

  return (
    <SidebarProvider>
      <PortalSidebar label={label} homeHref={homeHref} nav={nav} />

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1 md:hidden" />

          {searchPlaceholder && (
            <InputGroup className="max-w-xl">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput type="search" placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
            </InputGroup>
          )}

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <UserButton size="icon" align="end" />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">
          <PortalGuard area={area}>{children}</PortalGuard>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
