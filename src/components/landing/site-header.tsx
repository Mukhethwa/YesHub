import Link from "next/link";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthButtons } from "./auth-buttons";

const LINKS = [
  { href: "/#for-smes", label: "For SMEs" },
  { href: "/#for-buyers", label: "For buyers" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#fairness", label: "Fairness" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 md:px-6">
        <Link href="/" aria-label="MASLink home">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <AuthButtons />
        </div>
      </div>
    </header>
  );
}
