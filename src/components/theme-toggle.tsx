"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { useIsHydrated } from "@/components/auth/use-is-hydrated";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Switches between light and dark. Until someone picks one, the theme follows the device (see Providers);
 * the button always shows where a click takes you.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // The theme in effect is only known in the browser
  const isHydrated = useIsHydrated();
  const dark = isHydrated && resolvedTheme === "dark";
  const label = dark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} onClick={() => setTheme(dark ? "light" : "dark")}>
          {dark ? <SunIcon /> : <MoonIcon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
