import type { ReactNode } from "react";

import { Status, Tag, type Tone } from "@/components/app/status";

export function AdminPageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

/**
 * Kept for the screens that used it: a tone is a status (dot and text), and no tone is a neutral tag. New
 * code should use Status and Tag from src/components/app/status directly (DESIGN.md).
 */
export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return tone === "neutral" ? <Tag>{children}</Tag> : <Status tone={tone}>{children}</Status>;
}
