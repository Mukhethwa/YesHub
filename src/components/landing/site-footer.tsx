import Link from "next/link";

import { Logo } from "@/components/logo";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="space-y-2">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">
            Connecting enterprise tenders with the right SME providers.
          </p>
        </div>

        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <a href="#how-it-works" className="hover:text-foreground">
            How it works
          </a>
          <a href="#features" className="hover:text-foreground">
            Features
          </a>
          <Link href="/auth/sign-in" className="hover:text-foreground">
            Sign in
          </Link>
          <Link href="/auth/sign-up" className="hover:text-foreground">
            Register your business
          </Link>
        </nav>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-10 text-xs text-muted-foreground md:px-6">
        YES AI Hub · Challenge 4
      </div>
    </footer>
  );
}
