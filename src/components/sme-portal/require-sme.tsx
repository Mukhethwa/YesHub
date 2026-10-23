"use client";

import type { ReactNode } from "react";

import { Spinner } from "@/components/ui/spinner";
import { useCurrentSme } from "@/hooks/use-current-sme";
import type { SmeProfile } from "@/lib/sme/types";
import { SetupProfile } from "./setup-profile";

/**
 * Renders a dashboard section once the profile loads, or the setup prompt if there isn't one. Every section
 * uses the page's full width, like the rest of the portal; long forms lay their fields out in columns.
 */
export function RequireSme({ children }: { children: (sme: SmeProfile) => ReactNode }) {
  const sme = useCurrentSme();

  if (sme === undefined) return <Spinner className="mx-auto mt-24" />;
  if (sme === null) return <SetupProfile />;
  return <div className="w-full">{children(sme)}</div>;
}

export function SectionHeader({ title, description }: { title: string; description: ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
