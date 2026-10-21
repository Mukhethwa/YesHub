import Link from "next/link";

import { UserButton } from "@/components/auth/user/user-button";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
  return (
    <header className="sticky top-0 z-10 border-b bg-background">
      <div className="mx-auto flex items-center justify-between px-4 py-3 md:px-6">
        <Link href="/">
          <Logo />
        </Link>

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <UserButton size="icon" />
        </div>
      </div>
    </header>
  );
}
