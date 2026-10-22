"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import { ZA_PROVINCES, ZA_VIEWBOX } from "@/lib/za-provinces";

const [, , WIDTH, HEIGHT] = ZA_VIEWBOX.split(" ").map(Number);

export type MapTone = "blue" | "green" | "yellow" | "red";

const TONE: Record<MapTone, string> = {
  blue: "var(--brand-blue)",
  green: "var(--brand-green)",
  yellow: "var(--brand-yellow)",
  red: "var(--brand-red)",
};

/** Mixes the tone into the muted surface: empty provinces stay grey, the busiest is the full colour. */
const fill = (tone: MapTone, share: number) =>
  share === 0 ? "var(--muted)" : `color-mix(in oklab, ${TONE[tone]} ${Math.round(18 + share * 82)}%, var(--muted))`;

/**
 * A heat map of South Africa's provinces with a ranked list beside it. Hovering either highlights the
 * province in both.
 */
export function ProvinceMap({
  values,
  unit,
  tone = "blue",
  className,
}: {
  /** Keyed by province name, as in PROVINCES. */
  values: Record<string, number>;
  /** What's counted, plural, e.g. "applications". */
  unit: string;
  tone?: MapTone;
  className?: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const max = Math.max(0, ...Object.values(values));
  const total = Object.values(values).reduce((a, b) => a + b, 0);
  const ranked = ZA_PROVINCES.map((p) => ({ name: p.name, value: values[p.name] ?? 0 })).sort(
    (a, b) => b.value - a.value || a.name.localeCompare(b.name),
  );
  const active = hovered ? ZA_PROVINCES.find((p) => p.name === hovered) : null;

  return (
    <div className={cn("grid gap-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:items-center", className)}>
      <div className="relative mx-auto w-full max-w-md">
        <svg viewBox={ZA_VIEWBOX} className="h-auto w-full" role="img" aria-label={`${unit} by province`}>
          {ZA_PROVINCES.map((p) => {
            const value = values[p.name] ?? 0;
            return (
              <path
                key={p.name}
                d={p.d}
                fill={fill(tone, max ? value / max : 0)}
                stroke="var(--card)"
                strokeWidth={hovered === p.name ? 3 : 1.5}
                strokeLinejoin="round"
                className={cn(
                  "cursor-pointer transition-opacity outline-none",
                  hovered && hovered !== p.name && "opacity-60",
                )}
                tabIndex={0}
                onMouseEnter={() => setHovered(p.name)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(p.name)}
                onBlur={() => setHovered(null)}
              >
                <title>{`${p.name}: ${value} ${unit}`}</title>
              </path>
            );
          })}
        </svg>
        {active && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-md bg-brand-navy px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-md"
            style={{ left: `${(active.cx / WIDTH) * 100}%`, top: `${(active.cy / HEIGHT) * 100}%` }}
          >
            <span className="font-medium">{active.name}</span>
            <span className="ml-2 tabular-nums">
              {values[active.name] ?? 0} {unit}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <ul className="space-y-1">
          {ranked.map((row) => (
            <li
              key={row.name}
              onMouseEnter={() => setHovered(row.name)}
              onMouseLeave={() => setHovered(null)}
              className={cn(
                "grid grid-cols-[0.75rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-2 py-1 text-sm transition-colors",
                hovered === row.name && "bg-muted",
              )}
            >
              <span
                aria-hidden
                className="size-3 rounded-[3px]"
                style={{ background: fill(tone, max ? row.value / max : 0) }}
              />
              <span className="truncate">{row.name}</span>
              <span className="text-right tabular-nums">
                {row.value}
                <span className="ml-1.5 inline-block w-9 text-xs text-muted-foreground">
                  {total ? `${Math.round((row.value / total) * 100)}%` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <div className="space-y-1 px-2">
          <div
            aria-hidden
            className="h-2 rounded-full"
            style={{ background: `linear-gradient(to right, var(--muted), ${TONE[tone]})` }}
          />
          <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
            <span>0</span>
            <span>
              {max} {unit}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
