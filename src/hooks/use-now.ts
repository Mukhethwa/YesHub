"use client";

import { useEffect, useState } from "react";

/**
 * The current time, read in the browser after mount and refreshed every `everyMs`. Null while prerendering,
 * because reading the clock during render makes the output depend on when it ran.
 */
export function useNow(everyMs = 60_000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
