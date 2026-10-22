import type { ReactNode } from "react";

import { Illustration } from "@/components/illustrations/illustration";
import type { IllustrationName } from "@/components/illustrations/svgs";
import { cn } from "@/lib/utils";

/** What's empty and what to do about it, with an unDraw illustration (DESIGN.md). */
export function EmptyState({
  illustration,
  title,
  children,
  action,
  className,
  size = "md",
}: {
  illustration: IllustrationName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** "sm" inside a section, "md" when it's the whole page. */
  size?: "sm" | "md";
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 text-center", size === "md" ? "py-12" : "py-8", className)}>
      <Illustration name={illustration} className={size === "md" ? "h-36" : "h-24"} />
      <p className="mt-6 font-medium">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
