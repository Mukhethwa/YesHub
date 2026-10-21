"use client";

import { useState, useSyncExternalStore } from "react";
import { Dither, Shader, SimplexNoise } from "shaders/react";

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

/** Two close tones of the brand blue as an ordered dither: a quiet texture for the closing call to action. */
export function CtaDither({ className }: { className?: string }) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <Backdrop className={className}>
      <Dither pattern="bayer8" pixelSize={3} colorA="#1766c2" colorB="#1a6fd1">
        <SimplexNoise scale={2.5} speed={reducedMotion ? 0 : 0.12} seed={3} />
      </Dither>
    </Backdrop>
  );
}
