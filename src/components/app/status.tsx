import { CircleAlertIcon, CircleCheckIcon, CircleXIcon, InfoIcon, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const ICONS: Record<Exclude<Tone, "neutral">, { icon: LucideIcon; colour: string }> = {
  success: { icon: CircleCheckIcon, colour: "text-success" },
  warning: { icon: CircleAlertIcon, colour: "text-warning" },
  danger: { icon: CircleXIcon, colour: "text-destructive" },
  info: { icon: InfoIcon, colour: "text-primary" },
};

/**
 * State as a small coloured icon and plain text: "Open", "Banned", "Awaiting review". Neutral states are
 * just muted text. Pass `icon` when a different symbol says it better (a clock for "Closing soon"). See
 * DESIGN.md.
 */
export function Status({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  if (tone === "neutral") {
    return <span className={cn("text-xs whitespace-nowrap text-muted-foreground", className)}>{children}</span>;
  }
  const { icon: Default, colour } = ICONS[tone];
  const Icon = icon ?? Default;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap", className)}>
      <Icon aria-hidden className={cn("size-3.5 shrink-0", colour)} />
      {children}
    </span>
  );
}

/** A category or type: Tender, SME, Staff. Neutral and hairline-bordered, never coloured. */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-px text-xs whitespace-nowrap text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
