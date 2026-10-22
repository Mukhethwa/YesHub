"use client";

import { SearchIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { type CSSProperties, type ReactNode, useEffect, useState, useSyncExternalStore } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useRequireSession } from "@/hooks/use-require-session";
import { cn } from "@/lib/utils";
import { BreadcrumbProvider, Breadcrumbs } from "./breadcrumbs";
import { PortalGuard } from "./portal-guard";
import { activeNavItem, PortalSidebar } from "./portal-sidebar";
import type { PortalArea, PortalNavItem } from "./types";

/** The sidebar component remembers open or collapsed in this cookie; read it back so it survives reloads. */
const SIDEBAR_COOKIE = "sidebar_state=false";
const subscribe = () => () => {};
const sidebarOpenFromCookie = () => !document.cookie.split("; ").includes(SIDEBAR_COOKIE);

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
  useRequireSession();
  const pathname = usePathname();
  const page = activeNavItem(nav, pathname);

  // Prerendered open; the browser then applies the saved state
  const saved = useSyncExternalStore(subscribe, sidebarOpenFromCookie, () => true);
  const [chosen, setChosen] = useState<boolean | null>(null);
  // Skip the collapse animation while the saved state is applied on load
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <SidebarProvider
      open={chosen ?? saved}
      onOpenChange={setChosen}
      // The nav labels are short, so the sidebar needn't be the default 16rem
      style={{ "--sidebar-width": "13rem" } as CSSProperties}
      className={cn(!animate && "[&_*]:transition-none!")}
    >
      <PortalSidebar label={label} homeHref={homeHref} nav={nav} />

      {/* min-w-0 lets wide content (tables) scroll inside the page instead of widening it */}
      <SidebarInset className="min-w-0">
        <BreadcrumbProvider>
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-1 data-vertical:h-5 data-vertical:self-center" />
            <Breadcrumbs
              crumbs={[{ label, href: homeHref }, ...(page ? [{ label: page.label, href: page.href }] : [])]}
            />

            {searchPlaceholder && (
              <InputGroup className="ml-auto hidden w-64 shrink md:flex lg:w-80">
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput type="search" placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
              </InputGroup>
            )}

            <div className="ml-auto flex items-center gap-1 md:ml-2">
              <ThemeToggle />
            </div>
          </header>

          {/* SidebarInset is the <main> element */}
          <div className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6 lg:p-8">
            <PortalGuard area={area}>{children}</PortalGuard>
          </div>
        </BreadcrumbProvider>
      </SidebarInset>
    </SidebarProvider>
  );
}
