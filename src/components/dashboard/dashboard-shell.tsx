"use client";

import { useAuthenticate } from "@better-auth-ui/react";
import { SearchIcon } from "lucide-react";
import type { ReactNode } from "react";

import { UserButton } from "@/components/auth/user/user-button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { AppSidebar } from "./app-sidebar";

export function DashboardShell({ children }: { children: ReactNode }) {
  // Redirects to sign-in when there's no session (and if it ends while the page is open)
  const { data: session } = useAuthenticate(authClient);

  return (
    <SidebarProvider>
      <AppSidebar />

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1 md:hidden" />

          <InputGroup className="max-w-xl">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput type="search" placeholder="Search opportunities" aria-label="Search opportunities" />
          </InputGroup>

          <div className="ml-auto">
            <UserButton size="icon" align="end" />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">
          {session ? children : <Spinner className="mx-auto mt-24" />}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
