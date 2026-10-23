import { ArrowRightIcon, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Part } from "@/components/scene-parts";
import { cn } from "@/lib/utils";

export type StatItem = {
  label: string;
  value: ReactNode;
  /** One line of context. */
  context?: ReactNode;
  /** Something to do about this figure, e.g. { label: "Verify 4", href }. Shown instead of the context. */
  action?: { label: string; href: string };
  href?: string;
  /** Drawn large and faint in the corner, saying what the figure is about. */
  icon?: LucideIcon;
};

/**
 * Up to four figures in one row (DESIGN.md). The "brand" variant is the blue summary band at the top of a
 * dashboard; "plain" is for figures further down a page.
 */
export function StatStrip({
  items,
  variant = "plain",
  className,
  part = "stats",
}: {
  items: StatItem[];
  variant?: "brand" | "plain";
  className?: string;
  /** Its id in the marketing video's scenes. */
  part?: string;
}) {
  const brand = variant === "brand";
  return (
    <Part id={part}>
      <div
        className={cn(
          // Hairline dividers at any column count: the gaps show the colour behind the cells
          "grid grid-cols-2 gap-px overflow-hidden rounded-lg",
          brand ? "bg-white/15" : "border bg-border",
          items.length === 3 ? "sm:grid-cols-3" : items.length === 2 ? "" : "lg:grid-cols-4",
          // Three items on two columns: the last spans the row
          items.length === 3 && "[&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1",
          className,
        )}
      >
        {items.map((item) => {
          const cell = cn(
            "block flex-1 px-4 py-4 sm:px-5",
            item.href &&
              (brand
                ? "transition-colors hover:bg-[color-mix(in_oklab,var(--primary),black_8%)]"
                : "transition-colors hover:bg-muted/50"),
          );
          const body = (
            <>
              <p className={cn("text-sm", brand ? "text-primary-foreground/80" : "text-muted-foreground")}>
                {item.label}
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{item.value}</p>
              {!item.action && item.context && (
                <div
                  className={cn(
                    "mt-1 truncate text-xs",
                    brand ? "text-primary-foreground/75" : "text-muted-foreground",
                  )}
                >
                  {item.context}
                </div>
              )}
            </>
          );
          return (
            <div
              key={item.label}
              className={cn(
                "relative isolate flex flex-col overflow-hidden",
                brand ? "bg-primary text-primary-foreground" : "bg-card",
              )}
            >
              {item.icon && (
                <item.icon
                  aria-hidden
                  strokeWidth={1.5}
                  className={cn(
                    "pointer-events-none absolute -right-5 -bottom-7 -z-10 size-28 -rotate-12 sm:size-32",
                    brand ? "text-white/12" : "text-primary/8",
                  )}
                />
              )}
              {item.href ? (
                <Link href={item.href} className={cell}>
                  {body}
                </Link>
              ) : (
                <div className={cell}>{body}</div>
              )}
              {item.action && (
                <Link
                  href={item.action.href}
                  className={cn(
                    "-mt-3 inline-flex max-w-full min-w-0 items-center gap-1 px-4 pb-4 text-xs font-semibold underline-offset-4 sm:px-5",
                    // White on blue stays readable; the logo yellow is the accent underneath
                    brand ? "underline decoration-brand-yellow decoration-2" : "text-primary hover:underline",
                  )}
                >
                  <span className="truncate">{item.action.label}</span>
                  <ArrowRightIcon className="size-3.5 shrink-0" />
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </Part>
  );
}
