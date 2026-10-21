import Link from "next/link";

import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: LayoutProps<"/auth">) {
  return (
    <div className="relative flex min-h-svh flex-1 flex-col items-center justify-center gap-6 bg-muted/40 p-4 md:p-6">
      {/* Faint dot grid that fades out toward the edges */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-size-[20px_20px] mask-[radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
      />

      <Link href="/" className="relative">
        <Logo className="text-lg" />
      </Link>

      <div className="relative flex w-full justify-center">{children}</div>
    </div>
  );
}
