import Link from "next/link";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: LayoutProps<"/auth">) {
  return (
    <div className="relative flex min-h-svh flex-1 flex-col items-center justify-center gap-6 bg-muted/40 p-4 md:p-6">
      <div className="absolute top-3 right-3">
        <ThemeToggle />
      </div>

      <Link href="/" className="relative">
        <Logo className="h-10" />
      </Link>

      <div className="relative flex w-full justify-center">{children}</div>
    </div>
  );
}
