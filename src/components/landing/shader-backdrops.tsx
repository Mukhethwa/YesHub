"use client";

import { useTheme } from "next-themes";
import { useState, useSyncExternalStore } from "react";
import { ContourLines, Dither, Shader, SimplexNoise } from "shaders/react";

import { useIsHydrated } from "@/components/auth/use-is-hydrated";
import { cn } from "@/lib/utils";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(REDUCED_MOTION);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true,
  );
}

/**
 * Shared behaviour: renders only in the browser, and renders nothing when the GPU can't run it,
 * so the section's plain background shows through.
 */
function Backdrop({ className, children }: { className?: string; children: React.ReactNode }) {
  const isHydrated = useIsHydrated();
  const [unavailable, setUnavailable] = useState(false);

  if (!isHydrated || unavailable) return null;

  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0", className)}>
      <Shader className="size-full" disableTelemetry onUnavailable={() => setUnavailable(true)}>
        {children}
      </Shader>
    </div>
  );
}

/** Slowly drifting contour lines, like a survey map. Kept faint so it never competes with the copy. */
export function HeroContours() {
  const { resolvedTheme } = useTheme();
  const reducedMotion = usePrefersReducedMotion();
  const dark = resolvedTheme === "dark";

  return (
    <Backdrop className={dark ? "opacity-[0.14]" : "opacity-[0.10]"}>
      <ContourLines levels={14} lineWidth={1} colorMode="custom" lineColor={dark ? "#ffffff" : "#000000"}>
        <SimplexNoise scale={3} speed={reducedMotion ? 0 : 0.08} seed={7} />
      </ContourLines>
    </Backdrop>
  );
}

/** Two-tone ordered dither in the brand indigo, for the closing call to action. */
export function CtaDither({ className }: { className?: string }) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <Backdrop className={className}>
      <Dither pattern="bayer8" pixelSize={3} colorA="#3d3cc2" colorB="#5657ea">
        <SimplexNoise scale={2.5} speed={reducedMotion ? 0 : 0.12} seed={3} />
      </Dither>
    </Backdrop>
  );
}
