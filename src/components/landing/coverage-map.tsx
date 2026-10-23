"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";

import { ProvinceMap } from "@/components/app/province-map";
import { Part } from "@/components/scene-parts";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";

const rand = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", notation: "compact", maximumFractionDigits: 1 })
    .format(n)
    .replace(/\s/g, "");

export type Coverage = FunctionReturnType<typeof api.public.coverage>;

/**
 * Live figures for the landing page: where registered SMEs are and where open work is. `initial` shows
 * figures already fetched (the marketing video loads them before it starts) until the live query answers.
 */
export function CoverageMap({ initial }: { initial?: Coverage }) {
  const data = useQuery(api.public.coverage) ?? initial;
  const [metric, setMetric] = useState<"smes" | "opportunities">("smes");

  if (data === undefined) return <Skeleton className="h-96 w-full rounded-lg" />;

  const values = Object.fromEntries(data.provinces.map((p) => [p.province, p[metric]]));
  const figures = [
    { label: "Registered SMEs", value: data.smeCount.toLocaleString("en-ZA") },
    { label: "Open opportunities", value: data.openOpportunities.toLocaleString("en-ZA") },
    { label: "Value open to bid", value: data.openValue ? rand(data.openValue) : "None yet" },
  ];

  return (
    <Part id="cov-card">
      <div className="scene-unclip overflow-hidden rounded-lg border bg-card">
        <dl className="grid grid-cols-3 divide-x border-b">
          {figures.map((f, i) => (
            <Part key={f.label} id={"figure-" + i} className="bg-card px-4 py-4 sm:px-6">
              <dt className="text-xs text-muted-foreground sm:text-sm">{f.label}</dt>
              <dd className="mt-1 text-xl font-semibold tracking-tight tabular-nums sm:text-3xl">{f.value}</dd>
            </Part>
          ))}
        </dl>
        <div className="space-y-5 p-4 sm:p-6">
          <Part id="cov-toggle" className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1.5" role="group" aria-label="Map shows">
              {(
                [
                  { id: "smes", label: "SMEs" },
                  { id: "opportunities", label: "Open opportunities" },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={metric === option.id}
                  onClick={() => setMetric(option.id)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm transition-colors",
                    metric === option.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {metric === "opportunities" && data.nationwide > 0 && (
              <p className="text-xs text-muted-foreground">Plus {data.nationwide} open nationwide</p>
            )}
          </Part>
          <Part id="cov-map" className="rounded-lg bg-card">
            <ProvinceMap
              values={values}
              unit={metric === "smes" ? "SMEs" : "opportunities"}
              tone={metric === "smes" ? "green" : "blue"}
            />
          </Part>
        </div>
      </div>
    </Part>
  );
}
