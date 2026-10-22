import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A part of a page: a heading, an optional link or action on the right, and the content. Use this instead of
 * a card with a title and description (DESIGN.md).
 */
export function Section({
  title,
  description,
  href,
  linkLabel,
  action,
  children,
  className,
}: {
  title: string;
  /** Only when it says something the title can't. */
  description?: ReactNode;
  href?: string;
  linkLabel?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
        {href && (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            {linkLabel ?? "View all"}
            <ArrowRightIcon className="size-3.5" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** A bordered list of rows, the usual content of a Section. */
export function RowList({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("divide-y rounded-lg border bg-card", className)}>{children}</ul>;
}

/** One row: an optional type icon, a title and subtitle, and something on the right (a date, a status). */
export function Row({
  href,
  icon,
  title,
  subtitle,
  aside,
}: {
  href?: string;
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
}) {
  const body = (
    <>
      {icon && <span className="mt-0.5 shrink-0 text-muted-foreground [&_svg]:size-4">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
      </span>
      {aside && <span className="shrink-0 text-right text-xs text-muted-foreground">{aside}</span>}
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
          {body}
        </Link>
      ) : (
        <div className="flex items-start gap-3 px-4 py-3">{body}</div>
      )}
    </li>
  );
}
